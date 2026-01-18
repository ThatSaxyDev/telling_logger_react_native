import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { DeviceMetadata } from '../models';

/**
 * Collects device metadata during SDK initialization
 */
export async function collectDeviceInfo(): Promise<DeviceMetadata> {
  try {
    const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
    const osVersion = `${platform} ${DeviceInfo.getSystemVersion()}`;
    const deviceModel = await DeviceInfo.getModel();
    const appVersion = DeviceInfo.getVersion();
    const appBuildNumber = DeviceInfo.getBuildNumber();

    return {
      platform,
      osVersion,
      deviceModel,
      appVersion,
      appBuildNumber,
    };
  } catch {
    return {
      platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
    };
  }
}
