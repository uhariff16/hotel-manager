export const PLAN_LIMITS = {
  free: {
    maxResorts: 1,
    maxCottages: 1,
    maxRooms: 4,
    analyticsEnabled: false,
    reportsExportEnabled: false,
    label: 'Free Starter Plan'
  },
  pro: {
    maxResorts: 5,
    maxCottages: Infinity,
    maxRooms: Infinity,
    analyticsEnabled: true,
    reportsExportEnabled: true,
    label: 'Pro Manager Plan'
  },
  premium: {
    maxResorts: Infinity,
    maxCottages: Infinity,
    maxRooms: Infinity,
    analyticsEnabled: true,
    reportsExportEnabled: true,
    label: 'Luxury Premium Plan'
  }
};
