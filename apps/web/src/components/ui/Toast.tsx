import { Toaster, toast as sonnerToast } from "sonner";

type Toast = {
  title: string;
  description?: string;
  tone?: "default" | "success" | "danger";
};

export function notify(input: Toast) {
  const options = input.description ? { description: input.description } : undefined;
  if (input.tone === "success") {
    sonnerToast.success(input.title, options);
    return;
  }
  if (input.tone === "danger") {
    sonnerToast.error(input.title, options);
    return;
  }
  sonnerToast(input.title, options);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" theme="dark" richColors closeButton />
    </>
  );
}

export function useToast() {
  return notify;
}
