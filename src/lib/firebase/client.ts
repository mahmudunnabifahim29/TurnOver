"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "@firebase/app";
import { getAuth } from "@firebase/auth";
import { getFunctions } from "@firebase/functions";

function getConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Firebase is not configured. Copy the Firebase values from .env.example to .env.local.");
  }
  return { apiKey, authDomain, projectId, appId };
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(getConfig());
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export async function getFirebaseDb() {
  const { getFirestore } = await import("@firebase/firestore");
  return getFirestore(getFirebaseApp());
}

export function getFirebaseFunctions() {
  return getFunctions(getFirebaseApp(), "asia-southeast1");
}
