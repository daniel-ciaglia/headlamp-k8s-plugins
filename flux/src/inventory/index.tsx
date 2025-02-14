import { K8s } from '@kinvolk/headlamp-plugin/lib';
import { DateLabel, Link } from '@kinvolk/headlamp-plugin/lib/components/common';
import { KubeObject } from '@kinvolk/headlamp-plugin/lib/lib/k8s/cluster';
import React from 'react';
import Table from '../common/Table';
import { 
  parseID, 
  prepareCustomResourceLink, 
  prepareNameLink,
  getPlural,
  FLUX_CRDS 
} from '../helpers';

// CRD cache for performance
const crdCache = new Map<string, any>();

function getCRDForGroupKind(group: string, kind: string, callback: (crd: any) => void) {
  const crdKey = `${group}/${kind}`;
  if (crdCache.has(crdKey)) {
    callback(crdCache.get(crdKey));
    return;
  }

  const crdName = `${getPlural(kind)}.${group}`;
  K8s.ResourceClasses.CustomResourceDefinition.apiGet(
    (crd) => {
      if (crd) {
        crdCache.set(crdKey, crd);
        callback(crd);
      } else {
        callback(null);
      }
    },
    crdName
  )();
}

export function GetResourcesFromInventory({ inventory }: {
  inventory: { id: string; v: string; }[];
}) {
  const [resources, setResources] = React.useState<KubeObject[]>([]);
  const [crds, setCrds] = React.useState<{[key: string]: any}>({});

  React.useEffect(() => {
    const fetchResources = async () => {
      if (!inventory) return;

      for (const item of inventory) {
        const { namespace, name, group, kind } = parseID(item.id);
        
        // Try standard k8s resource first
        const k8sResource = K8s.ResourceClasses[kind];
        if (k8sResource) {
          k8sResource.apiGet(
            data => {
              setResources(prev => 
                prev.find(r => r.metadata.uid === data.metadata.uid)
                  ? prev
                  : [...prev, data]
              );
            },
            name,
            namespace
          )();
          continue;
        }

        // Try custom resource
        getCRDForGroupKind(group, kind, (crd) => {
          if (crd) {
            setCrds(prev => ({ ...prev, [kind]: crd }));
            
            const resourceClass = crd.makeCRClass();
            resourceClass.apiGet(
              data => {
                if (!data) return;
                
                const resourceData = {
                  ...data,
                  metadata: {
                    ...data.metadata,
                    name: data.metadata.name || name,
                    namespace: data.metadata.namespace || namespace
                  },
                  jsonData: {
                    ...data,
                    kind,
                    apiName: group,
                    metadata: {
                      ...data.metadata,
                      name: data.metadata.name || name,
                      namespace: data.metadata.namespace || namespace
                    }
                  }
                };

                setResources(prev => 
                  prev.find(r => r.metadata.uid === data.metadata.uid)
                    ? prev
                    : [...prev, resourceData]
                );
              },
              name,
              namespace
            )();
          }
        });
      }
    };

    fetchResources();
  }, [inventory]);

  return (
    <Table
      data={resources}
      columns={[
        {
          header: 'Name',
          accessorKey: 'metadata.name',
          Cell: ({ row: { original: item } }) => 
            K8s.ResourceClasses[item.kind]
              ? prepareNameLink(item)
              : prepareCustomResourceLink(item)
        },
        {
          header: 'Namespace',
          accessorKey: 'metadata.namespace',
          Cell: ({ row: { original: item } }) =>
            item?.metadata?.namespace ? (
              <Link routeName="namespace" params={{ name: item.metadata.namespace }}>
                {item.metadata.namespace}
              </Link>
            ) : null
        },
        {
          header: 'Kind',
          accessorFn: item => item.jsonData?.kind || item.kind
        },
        {
          header: 'Ready',
          accessorFn: item => 
            item.jsonData?.status?.conditions?.some(c => c.type === 'Ready')
              ? 'True'
              : 'False'
        },
        {
          header: 'Age',
          accessorFn: item => <DateLabel date={item?.metadata?.creationTimestamp} />
        }
      ]}
    />
  );
}
