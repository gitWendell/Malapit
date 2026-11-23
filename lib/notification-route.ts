import { rentalError } from "./rentals-server";
export const notificationHeaders={"Cache-Control":"private, no-store"};
export function notificationError(cause:unknown){const response=rentalError(cause);response.headers.set("Cache-Control","private, no-store");return response;}
