/**
 * The homepage selector lists downloaded voices only; a never-downloaded default
 * is handled by the existing first-use install flow rather than a fake option.
 */
export function availableModels(models, installedIds) {
  return models.filter(model => installedIds.has(model.id));
}
export function chooseAvailableModel(currentId, models, installedIds, defaultId) {
  if (installedIds.has(currentId)) return currentId;
  if (installedIds.has(defaultId)) return defaultId;
  return availableModels(models, installedIds)[0]?.id ?? defaultId;
}
export const SPEED_OPTIONS = Object.freeze(
  Array.from({ length: 13 }, (_, index) => (0.75 + index * 0.05).toFixed(2))
);
export function modelVoices(model, styles) {
  return model?.engine === 'supertonic' ? [...styles] : [];
}
