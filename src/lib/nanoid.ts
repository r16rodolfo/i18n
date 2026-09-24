import { nanoid } from "nanoid";

export function generateRoomId() {
  return nanoid(10);
}

export function generateTranscriptId() {
  return nanoid(12);
}

// Secret for guest invite links: 32 chars from nanoid's URL-safe alphabet
// (~190 bits), generated with the platform's secure random source.
export function generateInviteToken() {
  return nanoid(32);
}
