import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Marks an appointment as an on-demand No-Wait Live visit. */
export function LiveBadge() {
  return (
    <Badge variant="primary">
      <Zap className="h-3 w-3" /> Live
    </Badge>
  );
}
