// The storage ceilings a CLIENT component may read — deliberately not `server-only`, unlike `./paths`, and deliberately
// nothing but figures: no path is ever assembled in a client bundle (paths.ts's rule). DEC-293 §3,
// notes/story-media.md §8 — the capture refuses a video over this at once, before the PUT, with the same figure the
// bucket, `begin_story_video()`, the DAL and the worker hold.
export { STORY_VIDEO_MAX_BYTES } from "@kareem/storage-paths";
