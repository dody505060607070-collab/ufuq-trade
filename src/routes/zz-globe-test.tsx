import { createFileRoute } from "@tanstack/react-router";
import { BrainPage } from "./_authenticated/brain";
export const Route = createFileRoute("/zz-globe-test")({ ssr: false, component: BrainPage });
