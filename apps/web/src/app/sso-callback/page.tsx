"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SSOCallbackPage() {
  const router = useRouter();
  return <HandleSSOCallback
    navigateToApp={({ session, decorateUrl }) => {
      if (session?.currentTask) { router.replace("/sign-in"); return; }
      const url = decorateUrl("/");
      if (url.startsWith("http://") || url.startsWith("https://")) window.location.assign(url);
      else router.replace(url);
    }}
    navigateToSignIn={() => router.replace("/sign-in")}
    navigateToSignUp={() => router.replace("/sign-up")}
  />;
}
