import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ExamBatchSubNav, type SubNavItem } from "./kit";
import { useExamBatchRealtime } from "./use-exam-batch-realtime";

export function ExamBatchLayout({ nav, children }: { nav: SubNavItem[]; children?: ReactNode }) {
  useExamBatchRealtime();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 pb-10 pt-3 sm:px-5 sm:pt-4 lg:px-6">
      <ExamBatchSubNav items={nav} />
      <div className="space-y-6">{children ?? <Outlet />}</div>
    </div>
  );
}

