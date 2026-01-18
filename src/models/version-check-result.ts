/**
 * Result of a version check call.
 *
 * Used to determine if the app needs to be updated and whether
 * the update is required (blocking) or optional (skippable).
 */
export interface VersionCheckResult {
  /** Whether the current app version is below the minimum required version */
  requiresUpdate: boolean;

  /** Whether the update is mandatory (blocking) or optional (can skip) */
  isRequired: boolean;

  /** URL to the app store for updating */
  storeUrl?: string;

  /** Message to display to the user */
  message?: string;

  /** The minimum version that triggered this update prompt */
  minVersion?: string;
}

/** Default result indicating no update is needed */
export const noUpdateRequired: VersionCheckResult = {
  requiresUpdate: false,
  isRequired: false,
};
