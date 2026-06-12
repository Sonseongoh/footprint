import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelVisibilityMode="labeled" // always show labels under icons (Android)
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="globe">
        <NativeTabs.Trigger.Label>지구</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'public', selected: 'public' }}
          sf={{ default: 'globe.asia.australia', selected: 'globe.asia.australia.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>체크인</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'pin_drop', selected: 'pin_drop' }}
          sf={{ default: 'mappin.and.ellipse', selected: 'mappin.and.ellipse' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="records">
        <NativeTabs.Trigger.Label>기록</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'photo_library', selected: 'photo_library' }}
          sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'map', selected: 'map' }}
          sf={{ default: 'map', selected: 'map.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
