import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
const G = lazy(() => import("@/components/app/NeuralGalaxy"));
export const Route = createFileRoute("/zz-globe-test")({ ssr: false, component: () => (
  <div className="space-bg relative h-screen"><ClientOnly><Suspense><G items={[
    { id: "a", kind: "symbol", title: "XAUUSD", sub: "5 trades", value: "+$12.40" },
    { id: "b", kind: "symbol", title: "USOIL", sub: "2 trades", value: "-$3.10", tone: "down" },
    { id: "c", kind: "rule", title: "Avoid entries before NFP", sub: "R-1A2B · seen 3×" },
    { id: "d", kind: "win", title: "WIN TRADE", sub: "BUY XAUUSD", value: "+$8.20" },
    { id: "e", kind: "loss", title: "LOSS TRADE", sub: "SELL XAUUSD", value: "-$4.00", tone: "down" },
    { id: "f", kind: "layer", title: "Pattern Recognition", sub: "ICT · FVG · OB · BOS" },
    { id: "g", kind: "layer", title: "Market Analysis", sub: "RSI · EMA · ADX · ATR" },
    { id: "h", kind: "layer", title: "Prediction Layer", sub: "SELL XAUUSD · 68%" },
  ]} /></Suspense></ClientOnly></div>) });
