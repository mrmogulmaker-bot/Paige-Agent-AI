import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  legal_name: z.string().min(1, "Legal name is required"),
  business_type: z.enum(["holding", "parent", "subsidiary", "standalone"]),
  entity_type: z.string().optional(),
  ein: z.string().optional(),
  dba: z.string().optional(),
  state_of_formation: z.string().optional(),
});

interface AddBusinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentBusinessId?: string | null;
  onSuccess: () => void;
  /** Admin override: create the business on behalf of this user id instead of the logged-in user. */
  ownerUserId?: string | null;
}

export function AddBusinessDialog({
  open,
  onOpenChange,
  parentBusinessId,
  onSuccess,
  ownerUserId,
}: AddBusinessDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      legal_name: "",
      business_type: parentBusinessId ? "subsidiary" : "holding",
      entity_type: "",
      ein: "",
      dba: "",
      state_of_formation: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const organizationalLevel = parentBusinessId ? 1 : 0;
      const targetOwnerId = ownerUserId || user.id;

      const insertData: any = {
        owner_user_id: targetOwnerId,
        legal_name: values.legal_name,
        business_type: values.business_type,
        ein: values.ein || null,
        dba: values.dba || null,
        state_of_formation: values.state_of_formation || null,
        parent_business_id: parentBusinessId || null,
        organizational_level: organizationalLevel,
      };

      if (values.entity_type) {
        insertData.entity_type = values.entity_type;
      }

      const { error } = await supabase.from("businesses").insert(insertData);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Business added to organization chart",
      });

      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error adding business:", error);
      toast({
        title: "Error",
        description: "Failed to add business",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {parentBusinessId ? "Add Subsidiary Business" : "Add Business Entity"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Legal Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="ABC Holdings LLC" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="business_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Type *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!!parentBusinessId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="holding">Holding Company</SelectItem>
                      <SelectItem value="parent">Parent Company</SelectItem>
                      <SelectItem value="subsidiary">Subsidiary</SelectItem>
                      <SelectItem value="standalone">Standalone</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="entity_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="llc">LLC</SelectItem>
                        <SelectItem value="corporation">Corporation</SelectItem>
                        <SelectItem value="s_corp">S-Corp</SelectItem>
                        <SelectItem value="c_corp">C-Corp</SelectItem>
                        <SelectItem value="partnership">Partnership</SelectItem>
                        <SelectItem value="sole_proprietorship">
                          Sole Proprietorship
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state_of_formation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State of Formation</FormLabel>
                    <FormControl>
                      <Input placeholder="DE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ein"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EIN</FormLabel>
                    <FormControl>
                      <Input placeholder="XX-XXXXXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dba"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DBA (Doing Business As)</FormLabel>
                    <FormControl>
                      <Input placeholder="Trade name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Business"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
