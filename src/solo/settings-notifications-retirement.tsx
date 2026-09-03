import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { setupSubtabPath } from "./setup-subtab-route";

/** Compatibility only: never mount the retired page or read notification data. */
export function SettingsRouteBoundary({ children }: { children: ReactNode }) {
  const { account } = useParams();
  const { pathname } = useLocation();
  if (account && pathname.replace(/\/$/, "") === `/solo/${account}/settings/notifications`) {
    return <Navigate replace to={setupSubtabPath(account, "business-profile")} state={{ notificationMoveNotice: true }}/>;
  }
  return <>{children}</>;
}

/** Consume the history marker so reload, Back and Forward do not replay it. */
export function SettingsMoveNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const pending = location.state?.notificationMoveNotice === true;
  const [visible] = useState(pending);
  useEffect(() => {
    if (!pending) return;
    const nextState = { ...location.state };
    delete nextState.notificationMoveNotice;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: nextState });
  }, [pending, location.pathname, location.search, location.hash, location.state, navigate]);
  return visible ? <p className="ss-note" role="status">Notifications now appear in the area where the work happens.</p> : null;
}
