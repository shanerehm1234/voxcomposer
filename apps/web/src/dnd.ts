/**
 * Custom HTML5 drag mime types used between app surfaces. (Audio files from
 * the OS arrive as plain `Files`; these cover in-app drags.)
 */

/** A device dragged from the sidebar/devices view onto the timeline.
 *  Payload: JSON `{ id, name, type }` of the VoxDevice. */
export const DEVICE_DRAG_TYPE = 'application/x-vox-device';
