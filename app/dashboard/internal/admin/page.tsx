import { redirect } from "next/navigation";

export default function AdminHome() {
  redirect("/dashboard/internal/admin/agent-hq");
}
