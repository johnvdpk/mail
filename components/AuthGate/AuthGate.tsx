"use client";

import { useRouter } from "next/navigation";
import LoginScreen from "@/components/LoginScreen/LoginScreen";

export default function AuthGate() {
  const router = useRouter();

  return <LoginScreen onSuccess={() => router.refresh()} />;
}
