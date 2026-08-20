import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OWNER_LOGIN_PATH, SUPER_ADMIN_PATH } from "./ownerPortal";
import Home from "./pages/Home";
import TrackOrder from "./pages/TrackOrder";
import Dashboard from "./pages/Dashboard";
import AdminLogin from "./pages/AdminLogin";
import Invoice from "./pages/Invoice";
import OwnerControl from "./pages/OwnerControl";
import StaffPortal from "./pages/StaffPortal";
import CustomerPortal from "./pages/CustomerPortal";
import ScratchCard from "./pages/ScratchCard";
import Contact from "./pages/Contact";
import WaitingScreen from "./pages/WaitingScreen";
import OwnerBranchSelect from "./pages/OwnerBranchSelect";
import SuperAdminPortal from "./pages/SuperAdminPortal";
import { PresenceHeartbeat } from "./components/PresenceHeartbeat";
import { DirectMessageInbox } from "./components/DirectMessageInbox";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/track"} component={TrackOrder} />
      <Route path={"/invoice"} component={Invoice} />
      <Route path={"/invoice/:token"} component={Invoice} />
      <Route path={"/team"} component={StaffPortal} />
      <Route path={"/account"} component={CustomerPortal} />
      <Route path={"/scratch/:code"} component={ScratchCard} />
      <Route path={"/contact"} component={Contact} />
      <Route path={"/waiting/:slug"} component={WaitingScreen} />
      <Route path={OWNER_LOGIN_PATH} component={AdminLogin} />
      <Route path={SUPER_ADMIN_PATH} component={SuperAdminPortal} />
      <Route path={"/admin-login"}><Redirect to="/" /></Route>
      <Route path={"/admin"}><Redirect to="/" /></Route>
      <Route path={"/dashboard/control"} component={OwnerControl} />
      <Route path={"/dashboard/branches"} component={OwnerBranchSelect} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <PresenceHeartbeat />
          <DirectMessageInbox />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
