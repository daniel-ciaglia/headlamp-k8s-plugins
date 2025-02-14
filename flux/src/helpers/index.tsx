import { K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  HoverInfoLabel,
  Link,
  SectionBox,
  ShowHideLabel,
} from '@kinvolk/headlamp-plugin/lib/components/common';
import { KubeObject } from '@kinvolk/headlamp-plugin/lib/lib/k8s/cluster';
import { localeDate, timeAgo } from '@kinvolk/headlamp-plugin/lib/Utils';
import Table from '../common/Table';

const kindToSourceType = {
  GitRepository: 'gitrepositories',
  OCIRepository: 'ocirepositories',
  Bucket: 'buckets',
  HelmRepository: 'helmrepositories',
  HelmChart: 'helmcharts',
};

export function getSourceNameAndType(item: KubeObject) {
  const itemKind = item.jsonData.kind;
  let type = '';
  let name = '';

  if (itemKind === 'Kustomization') {
    type = kindToSourceType[item.jsonData.spec.sourceRef.kind] ?? '';
    name = item.jsonData.spec?.sourceRef?.name;
  } else if (itemKind === 'HelmRelease') {
    const refToCheck =
      item?.jsonData?.spec?.chartRef ?? item?.jsonData?.spec?.chart?.spec?.sourceRef;
    if (refToCheck) {
      type = kindToSourceType[refToCheck.kind] ?? '';
      name = refToCheck.name;
    }
  } else {
    type = kindToSourceType[itemKind] ?? '';
    name = item.metadata.name;
  }

  return { name, type };
}

export function ObjectEvents(props: { events: any }) {
  const { events } = props;
  if (!events) {
    return null;
  }
  return (
    <SectionBox title={'Events'}>
      <Table
        defaultSortingColumn={4}
        columns={[
          {
            header: 'Type',
            accessorFn: item => {
              return item.type;
            },
          },
          {
            header: 'Reason',
            accessorFn: item => {
              return item.reason;
            },
          },
          {
            header: 'From',
            accessorFn: item => {
              return item.source.component;
            },
          },
          {
            header: 'Message',
            accessorFn: item => {
              return (
                item && (
                  <ShowHideLabel labelId={`${item?.metadata?.uid}-message`}>
                    {item.message ?? ''}
                  </ShowHideLabel>
                )
              );
            },
          },
          {
            id: 'age',
            header: 'Age',
            accessorFn: item => {
              if (item.count > 1) {
                return `${timeAgo(item.lastOccurrence)} (${item.count} times over ${timeAgo(
                  item.firstOccurrence
                )})`;
              }
              const eventDate = timeAgo(item.lastOccurrence, { format: 'mini' });
              let label: string;
              if (item.count > 1) {
                label = `${eventDate} ${item.count} times since ${timeAgo(item.firstOccurrence)}`;
              } else {
                label = eventDate;
              }

              return (
                <HoverInfoLabel
                  label={label}
                  hoverInfo={localeDate(item.lastOccurrence)}
                  icon="mdi:calendar"
                />
              );
            },
            gridTemplate: 'min-content',
            enableColumnFilter: false,
            muiTableBodyCellProps: {
              align: 'right',
            },
            sortingFn: (rowA, rowB) => {
              return (
                new Date(rowB.lastTimestamp).getTime() - new Date(rowA.lastTimestamp).getTime()
              );
            },
          },
        ]}
        data={events}
        initialState={{
          sorting: [
            {
              id: 'Age',
              desc: false,
            },
          ],
        }}
      />
    </SectionBox>
  );
}

export function prepareNameLink(item) {
  const kind = item.kind;
  if (kind === 'Kustomization' || kind === 'HelmRelease' || kind in kindToSourceType) {
    const { name, type } = getSourceNameAndType(item);
    if (!!name && !!type) {
      return (
        <Link
          routeName={`/flux/sources/:type/:namespace/:name`}
          params={{
            name: item.metadata.name,
            namespace: item.metadata.namespace,
            type,
          }}
        >
          {name}
        </Link>
      );
    }
  }

  const resourceKind = K8s.ResourceClasses[kind];
  if (resourceKind) {
    const resource = new resourceKind(item);
    if (resource?.getDetailsLink && resource.getDetailsLink()) {
      return <Link kubeObject={resource}>{item.metadata.name}</Link>;
    }
    return item.metadata.name;
  }

  return item.metadata.name;
}

export function parseDuration(duration) {
  const regex = /(\d+)([hms])/g; // Match numbers followed by h, m, or s
  let totalMilliseconds = 0;
  let match;

  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'h':
        totalMilliseconds += value * 60 * 60 * 1000; // Convert hours to milliseconds
        break;
      case 'm':
        totalMilliseconds += value * 60 * 1000; // Convert minutes to milliseconds
        break;
      case 's':
        totalMilliseconds += value * 1000; // Convert seconds to milliseconds
        break;
    }
  }

  return totalMilliseconds;
}

// Constants
export const FLUX_CRDS = {
  KUSTOMIZE: 'kustomizations.kustomize.toolkit.fluxcd.io',
  HELMRELEASE: 'helmreleases.helm.toolkit.fluxcd.io',
  SOURCES: {
    GIT: 'gitrepositories.source.toolkit.fluxcd.io',
    HELM: 'helmrepositories.source.toolkit.fluxcd.io',
    OCI: 'ocirepositories.source.toolkit.fluxcd.io',
    BUCKET: 'buckets.source.toolkit.fluxcd.io'
  }
};

// Pluralization helper
export function getPlural(kind: string): string {
  const specialCases: { [key: string]: string } = {
    'Bucket': 'buckets',
    'GitRepository': 'gitrepositories',
    'HelmRelease': 'helmreleases',
    'HelmRepository': 'helmrepositories',
    'Kustomization': 'kustomizations',
    'OCIRepository': 'ocirepositories',
  };
  
  return specialCases[kind] || `${kind.toLowerCase()}s`;
}

// ID parsing helper
export function parseID(id: string) {
  const parts = id.split('_');
  return {
    namespace: parts[0] === '' ? undefined : parts[0],
    name: parts[1],
    group: parts[2],
    kind: parts[3]
  };
}

// Route helper
export function getCustomResourceRoute(item: KubeObject) {
  if (!item) return 'crd';
  
  const kind = item?.jsonData?.kind || item?.kind;
  if (!kind) return 'crd';
  
  switch (kind) {
    case 'Kustomization':
      return 'kustomizations';
    case 'HelmRelease':
      return 'helmrelease';
    case 'OCIRepository':
    case 'GitRepository':
    case 'HelmRepository':
      return 'source';
    case 'Bucket':
      return 'bucket';
    default:
      return 'crd';
  }
}

// Link preparation helper
export function prepareCustomResourceLink(item: KubeObject) {
  if (!item) return null;
  
  const route = getCustomResourceRoute(item);
  const kind = item?.jsonData?.kind || item?.kind;
  const apiName = item?.jsonData?.apiName || '';
    
  if (!kind) return null;
  
  if (route === 'source') {
    return (
      <Link
        routeName="source"
        params={{
          type: getPlural(kind),
          name: item.metadata?.name,
          namespace: item.metadata?.namespace
        }}
      >
        {item.metadata?.name}
      </Link>
    );
  }
  
  if (route === 'crd') {
    return (
      <Link
        routeName="customresource"
        params={{
          crd: `${getPlural(kind)}.${apiName}`,
          crName: item.metadata?.name,
          namespace: item.metadata?.namespace,
        }}
      >
        {item.metadata?.name}
      </Link>
    );
  }

  return (
    <Link
      routeName={route}
      params={{
        type: getPlural(kind),
        name: item.metadata?.name,
        namespace: item.metadata?.namespace || item.jsonData?.metadata?.namespace
      }}
    >
      {item.metadata?.name}
    </Link>
  );
}
