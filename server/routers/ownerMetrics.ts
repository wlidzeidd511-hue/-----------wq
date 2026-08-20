import { ownerBranchProcedure, router } from "../_core/trpc";
import { getOwnerOverviewMetrics } from "../ownerOverviewDb";

export const ownerMetricsRouter = router({
  overview: ownerBranchProcedure.query(({ ctx }) => getOwnerOverviewMetrics(ctx.ownerBranch.branchId)),
});
