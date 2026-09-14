import { toast } from "sonner";

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastError(message: string) {
  toast.error(message);
}

export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string },
) {
  return toast.promise(promise, messages);
}
