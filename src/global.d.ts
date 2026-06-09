declare const pendo:
  | {
      track: (eventName: string, metadata?: Record<string, unknown>) => void;
    }
  | undefined;
