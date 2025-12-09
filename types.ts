export interface VideoFile {
  id: string;
  file: File;
  previewUrl: string;
  duration: number;
  name: string;
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ProcessingProgress {
  currentClipIndex: number;
  totalClips: number;
  statusMessage: string;
}

export interface AIGeneratedMetadata {
  title: string;
  description: string;
}
