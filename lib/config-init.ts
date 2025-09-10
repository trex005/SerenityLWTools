// Define a minimal default configuration that will be used if fetching fails
export const initialConfig = {
  events: [
    {
      id: "default-1",
      title: "Example Event",
      description: "This is a default event that appears when the configuration cannot be loaded.",
      isAllDay: true,
      startTime: "09:00",
      endTime: "10:00",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      includeInExport: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
      },
      variations: {},
      dateOverrides: {},
      dateIncludeOverrides: {},
      order: {},
      archived: false,
      recurrence: {
        type: "weekly",
        daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        interval: 1,
      },
    },
  ],
  tips: [
    {
      id: "default-tip-1",
      title: "Default Tip",
      content: "This is a default tip that appears when the configuration cannot be loaded.",
      lastUsed: null,
    },
  ],
  exportDate: new Date().toISOString(),
}

// Export the minimal fallback configuration
export const configEvents = initialConfig.events
export const configTips = initialConfig.tips
export const exportDate = initialConfig.exportDate
