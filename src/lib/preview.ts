export const hostedPreview = import.meta.env.XOCOMPASS_HOSTED_PREVIEW === true;
export const browserTrainingEnabled =
  hostedPreview && import.meta.env.VITE_XOCOMPASS_BROWSER_TRAINING === "1";
