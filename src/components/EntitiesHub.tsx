import { useState } from 'react';
import { View } from 'react-native';

import { SegmentedTabs } from '@/components/ui';
import { WorldsPanel } from '@/components/WorldsPanel';
import { OrganizationsPanel } from '@/components/OrganizationsPanel';
import { LocationsPanel } from '@/components/LocationsPanel';
import { ItemsPanel } from '@/components/ItemsPanel';
import { CareersPanel } from '@/components/CareersPanel';

const SUB_TABS = [
  { key: 'settings', label: '设定' },
  { key: 'orgs', label: '组织' },
  { key: 'locations', label: '地点' },
  { key: 'items', label: '物品' },
  { key: 'careers', label: '职业' },
] as const;

type SubKey = (typeof SUB_TABS)[number]['key'];

/** 世界 Tab 的实体中心：设定 / 组织 / 地点 / 物品 / 职业 五个二级分栏 */
export function EntitiesHub({ projectId }: { projectId: number }) {
  const [sub, setSub] = useState<SubKey>('settings');
  return (
    <View style={{ gap: 10 }}>
      <SegmentedTabs tabs={SUB_TABS.map((t) => ({ key: t.key, label: t.label }))} active={sub} onChange={(k) => setSub(k as SubKey)} />
      {sub === 'settings' ? <WorldsPanel projectId={projectId} /> : null}
      {sub === 'orgs' ? <OrganizationsPanel projectId={projectId} /> : null}
      {sub === 'locations' ? <LocationsPanel projectId={projectId} /> : null}
      {sub === 'items' ? <ItemsPanel projectId={projectId} /> : null}
      {sub === 'careers' ? <CareersPanel projectId={projectId} /> : null}
    </View>
  );
}
