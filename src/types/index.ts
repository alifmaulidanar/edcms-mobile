// User type definition
interface User {
  id: string;
  user_id: string;
  email: string;
  username: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  password: string;
}

// Profile type definition
export interface Profile {
  id: string;
  user_id: string;
  avatar?: string;
  email: string;
  username: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  ticket_id: string;
  trip_id: string;
  user_id: string;
  geofence_id: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  additional_info?: any;
  validation_status?: string;
  validated_at?: string;
  validated_by?: string;
  hold_at?: string;
  hold_by?: string;
  hold_noted?: string;
}

export interface Geofence {
  id: string;
  radar_id: string;
  external_id: string;
  description: string;
  tag: string;
  type: string;
  radius: number;
  coordinates: [number, number];
  status: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  radar_id: string,
  external_id: string,
  user_id: string,
  geofence_id: string,
  geofence_tag: string,
  mode: string,
  status: string,
  duration: number,
  live: boolean,
  approaching_threshold: number,
  locations?: number[],
  metadata?: any,
  started_location?: {
    latitude: number;
    longitude: number;
  };
  ended_location?: {
    latitude: number;
    longitude: number;
  };
  started_at?: string;
  ended_at?: string;
};

export interface QueueItem {
  ticket_id: string;
  user_id: string;
  photos: string[];
  attempts?: number;
  timestamp: any;
  location: any;
  photoStartIndex?: number; // Add optional photoStartIndex property to track starting index for multi-phase uploads
};

// Location cache to prevent redundant API calls
export interface LocationCache {
  timestamp: number;
  data: {
    latitude: number;
    longitude: number;
    jalan: string;
    kelurahan: string;
    kecamatan: string;
    kota: string;
    provinsi: string;
    kode_pos: string;
    negara: string;
  } | null;
}