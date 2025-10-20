import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react";

export function CurrentDateTime() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="font-medium">{format(currentTime, "EEEE, MMMM d, yyyy")}</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="font-medium tabular-nums">{format(currentTime, "h:mm:ss a")}</span>
      </div>
    </div>
  );
}
