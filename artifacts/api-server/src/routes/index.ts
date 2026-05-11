import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import creatorsRouter from "./creators";
import adminRouter from "./admin";
import campaignsRouter from "./campaigns";
import statsRouter from "./stats";
import walletRouter from "./wallet";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/events", eventsRouter);
router.use("/creator", creatorsRouter);
router.use("/admin", adminRouter);
router.use("/campaigns", campaignsRouter);
router.use("/stats", statsRouter);
router.use("/wallet", walletRouter);
router.use("/organizer", walletRouter);

export default router;
