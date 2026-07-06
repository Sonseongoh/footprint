import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Palette } from '@/constants/footprint-theme';

export default function AppTabs() {
  // The app is dark-by-design (every screen hardcodes Palette.bg). The tab bar
  // must match — following the system scheme gave light-mode devices a white
  // bar under navy screens.
  return (
    <NativeTabs
      backgroundColor={Palette.bg}
      indicatorColor={Palette.surface}
      labelVisibilityMode="labeled" // always show labels under icons (Android)
      labelStyle={{ selected: { color: Palette.ink } }}>
      {/* the globe IS the app's front door (index) — first impression on launch */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>지구</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'public', selected: 'public' }}
          sf={{ default: 'globe.asia.australia', selected: 'globe.asia.australia.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="checkin">
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

      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>나</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'person', selected: 'person' }}
          sf={{ default: 'person', selected: 'person.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
