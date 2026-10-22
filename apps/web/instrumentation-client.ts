/*
 * Runs before the app hydrates, so it lands ahead of react-dom. WizeLens times
 * each React render through the global hook react-dom reads once, at load. Only
 * when this page's server traces it; see components/wizelens.tsx.
 */
import { installReactHook } from "@wizeworks/lens-react";
import { serverTraces } from "./components/wizelens";

if (serverTraces()) installReactHook();
