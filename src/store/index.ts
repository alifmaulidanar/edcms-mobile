import { createSlice, configureStore } from '@reduxjs/toolkit';
// import { Geofence } from '../types';

// User data type
interface UserData {
  id: number;
  user_id: string;
  email: string;
  username: string;
  role: string;
  phone: string;
}

// User slice
const userSlice = createSlice({
  name: 'user',
  initialState: null as UserData | null,
  reducers: {
    setUser: (state, action) => action.payload,
    clearUser: () => null,
  },
});

// Geofence slice
// const geofenceSlice = createSlice({
//   name: 'geofence',
//   initialState: [] as Geofence[],
//   reducers: {
//     setGeofence: (state, action) => action.payload,
//     clearGeofence: () => [],
//   },
// });

// Action creators
export const { setUser, clearUser } = userSlice.actions;
// export const { setGeofence, clearGeofence } = geofenceSlice.actions;

// Redux store configuration
const store = configureStore({
  reducer: {
    user: userSlice.reducer,
    // geofence: geofenceSlice.reducer
  },
});

// Root state type
export type RootState = ReturnType<typeof store.getState>;

export default store;
