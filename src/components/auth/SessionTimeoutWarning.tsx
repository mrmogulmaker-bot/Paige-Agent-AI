import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

interface Props {
  open: boolean;
  onStaySignedIn: () => void;
}

export const SessionTimeoutWarning = ({ open, onStaySignedIn }: Props) => (
  <AlertDialog open={open}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-2">
          <Clock className="w-6 h-6 text-gold" />
        </div>
        <AlertDialogTitle className="text-center">Session Expiring Soon</AlertDialogTitle>
        <AlertDialogDescription className="text-center">
          For your security, you'll be signed out in about 2 minutes due to inactivity. Click below to stay signed in.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:justify-center">
        <AlertDialogAction onClick={onStaySignedIn} className="w-full sm:w-auto rounded-xl font-semibold">
          Stay Signed In
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
