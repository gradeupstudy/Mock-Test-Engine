// Google Drive REST API Client for Gradeup Study JSON Backups
import firebaseConfig from '../../firebase-applet-config.json';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const TOKEN_KEY = 'gradeup_gdrive_access_token';
const TOKEN_TIME_KEY = 'gradeup_gdrive_token_time';
const CUSTOM_CLIENT_ID_KEY = 'gradeup_gdrive_custom_client_id';
const DEFAULT_BACKUP_FILENAME = 'Gradeup_Study_Backup.json';

export interface DriveBackupFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
}

export interface DriveUserInfo {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
  storageUsage?: number;
  storageLimit?: number;
}

export function getCustomDriveClientId(): string {
  return localStorage.getItem(CUSTOM_CLIENT_ID_KEY) || '';
}

export function saveCustomDriveClientId(clientId: string): void {
  if (clientId.trim()) {
    localStorage.setItem(CUSTOM_CLIENT_ID_KEY, clientId.trim());
  } else {
    localStorage.removeItem(CUSTOM_CLIENT_ID_KEY);
  }
}

export function getStoredDriveToken(): string {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const time = parseInt(localStorage.getItem(TOKEN_TIME_KEY) || '0', 10);
  // Tokens expire after 1 hour (3600 seconds)
  if (token && Date.now() - time > 3500 * 1000) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
    return '';
  }
  return token;
}

export function saveDriveToken(token: string): void {
  if (token.trim()) {
    localStorage.setItem(TOKEN_KEY, token.trim());
    localStorage.setItem(TOKEN_TIME_KEY, Date.now().toString());
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
  }
}

export function clearDriveToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_TIME_KEY);
}

/**
 * Request Access Token via Firebase Authentication Popup
 * This is the most resilient approach for custom domains (e.g., Vercel)
 */
export async function requestDriveTokenViaFirebase(): Promise<string> {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error('Google Sign-In completed, but no OAuth access token was returned for Google Drive.');
    }

    saveDriveToken(credential.accessToken);
    return credential.accessToken;
  } catch (err: any) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (err.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-In popup was closed before completing authorization.');
    }
    if (err.message && err.message.includes('origin_mismatch')) {
      throw new Error(`Error 400: origin_mismatch - The current domain (${origin}) is not authorized in Google Cloud Console.`);
    }
    throw new Error(err?.message || 'Firebase Google Sign-In failed.');
  }
}

/**
 * Ensures Google Identity Services (GIS) client script is available on window
 */
export async function ensureGisLoaded(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google GIS script')));
      // If already loaded
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google GIS script'));
    document.head.appendChild(script);
  });
}

/**
 * Request Access Token using Google Identity Services Token Client
 */
export async function requestDriveAccessToken(overrideClientId?: string): Promise<string> {
  await ensureGisLoaded();

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK is not available. Please refresh or check connection.'));
      return;
    }

    try {
      const customId = getCustomDriveClientId();
      const clientId = overrideClientId || customId || (firebaseConfig as any).oAuthClientId || (firebaseConfig as any).clientId || '';
      if (!clientId) {
        reject(new Error('Google OAuth Client ID is missing in configuration. Please configure OAuth.'));
        return;
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.access_token) {
            saveDriveToken(response.access_token);
            resolve(response.access_token);
          } else if (response.error) {
            const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
            if (response.error === 'origin_mismatch' || response.error_description?.includes('origin_mismatch')) {
              reject(new Error(`Error 400: origin_mismatch - Domain "${currentOrigin}" is not registered in Google Cloud Console Authorized JavaScript origins.`));
            } else {
              reject(new Error(response.error_description || response.error || 'Authorization failed'));
            }
          } else {
            reject(new Error('Failed to retrieve access token'));
          }
        },
        error_callback: (err: any) => {
          const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
          reject(new Error(err?.message || `Google OAuth authentication failed. (Origin: ${currentOrigin})`));
        }
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      reject(new Error(err?.message || `Could not launch Google OAuth authentication flow for ${currentOrigin}.`));
    }
  });
}

/**
 * Get connected Google User Info and Storage Quota
 */
export async function getDriveUserInfo(authToken?: string): Promise<{ success: boolean; user?: DriveUserInfo; error?: string }> {
  const token = authToken || getStoredDriveToken();
  if (!token) {
    return { success: false, error: 'Google Drive is not connected. Access token missing.' };
  }

  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearDriveToken();
        return { success: false, error: 'Access token expired. Please re-connect Google Drive.' };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error?.message || `HTTP ${res.status} error` };
    }

    const data = await res.json();
    const user = data.user || {};
    const quota = data.storageQuota || {};

    return {
      success: true,
      user: {
        displayName: user.displayName || 'Google User',
        emailAddress: user.emailAddress || '',
        photoLink: user.photoUrl || user.photoLink || '',
        storageUsage: parseInt(quota.usage || '0', 10),
        storageLimit: parseInt(quota.limit || '0', 10)
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while fetching Google Drive profile.' };
  }
}

/**
 * List Backup JSON files stored in Google Drive
 */
export async function listDriveBackups(authToken?: string): Promise<{ success: boolean; files: DriveBackupFile[]; error?: string }> {
  const token = authToken || getStoredDriveToken();
  if (!token) {
    return { success: false, files: [], error: 'Google Drive is not connected.' };
  }

  try {
    const q = encodeURIComponent("name contains 'Gradeup_' and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&orderBy=modifiedTime desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearDriveToken();
        return { success: false, files: [], error: 'Access token expired. Please re-connect Google Drive.' };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, files: [], error: errData.error?.message || 'Failed to list files from Google Drive' };
    }

    const data = await res.json();
    return { success: true, files: data.files || [] };
  } catch (err: any) {
    return { success: false, files: [], error: err.message || 'Network error' };
  }
}

/**
 * Save JSON Backup file to Google Drive (Create or Update existing file)
 */
export async function saveBackupToDrive(
  backupData: any,
  customFilename?: string,
  authToken?: string
): Promise<{ success: boolean; fileId?: string; filename?: string; error?: string }> {
  const token = authToken || getStoredDriveToken();
  if (!token) {
    return { success: false, error: 'Google Drive is not connected. Please connect first.' };
  }

  const fileName = customFilename || DEFAULT_BACKUP_FILENAME;
  const jsonContent = JSON.stringify(backupData, null, 2);

  try {
    // 1. Check if file with same name already exists in Google Drive
    const listRes = await listDriveBackups(token);
    let existingFile: DriveBackupFile | undefined;
    if (listRes.success) {
      existingFile = listRes.files.find(f => f.name === fileName);
    }

    if (existingFile) {
      // 2. UPDATE existing file content using PATCH media endpoint
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      const res = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: jsonContent
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error?.message || 'Failed to update Google Drive backup file' };
      }

      const updatedData = await res.json();
      return { success: true, fileId: updatedData.id || existingFile.id, filename: fileName };
    } else {
      // 3. CREATE new file using Multipart upload
      const metadata = {
        name: fileName,
        mimeType: 'application/json'
      };

      const boundary = '-------GradeupDriveUploadBoundary' + Math.random().toString(36).substring(2);
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonContent +
        closeDelimiter;

      const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error?.message || 'Failed to create Google Drive backup file' };
      }

      const createdData = await res.json();
      return { success: true, fileId: createdData.id, filename: fileName };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error uploading backup to Google Drive' };
  }
}

/**
 * Fetch / Download JSON Backup content from Google Drive by fileId
 */
export async function downloadBackupFromDrive(
  fileId: string,
  authToken?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = authToken || getStoredDriveToken();
  if (!token) {
    return { success: false, error: 'Google Drive is not connected.' };
  }

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearDriveToken();
        return { success: false, error: 'Access token expired.' };
      }
      return { success: false, error: `HTTP ${res.status} error reading backup file` };
    }

    const backupContent = await res.json();
    return { success: true, data: backupContent };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error downloading backup file from Google Drive' };
  }
}

/**
 * Delete a Backup file from Google Drive
 */
export async function deleteBackupFromDrive(fileId: string, authToken?: string): Promise<{ success: boolean; error?: string }> {
  const token = authToken || getStoredDriveToken();
  if (!token) {
    return { success: false, error: 'Google Drive is not connected.' };
  }

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      return { success: false, error: `Failed to delete file from Google Drive` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error deleting file' };
  }
}
