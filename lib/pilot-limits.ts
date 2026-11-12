export const PILOT_LIMITS = {
  properties: 30,
  photosPerProperty: 5,
  photoBytes: 400 * 1024,
  photoDimension: 1600,
  storageBytes: 100 * 1024 * 1024,
  storedPhotos: 250,
  uploadsPerOwnerPerDay: 10,
} as const;

export type PilotStatus = {
  signInReady: boolean;
  signInProvider: "local" | "google";
  photosReady: boolean;
  submissionOpen: boolean;
  propertiesLimit: number;
  photosPerProperty: number;
  usage?: { properties: number; photos: number; bytes: number; pendingPhotos: number };
};
