"use client";

// import "./index.css";
import { useState, useEffect } from "react";
import { Session, createClient } from "@supabase/supabase-js";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Stack, Text, Title } from "@mantine/core";
import { AppMain } from "../AppMain";

const supabase = createClient(
  "https://lpwmuitdroismgidgwve.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwd211aXRkcm9pc21naWRnd3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjAzODQzMDEsImV4cCI6MjAzNTk2MDMwMX0.tK1BcVsjxWHL2n_wCGKNIt5TQ7xfNY6pbMw3QCQXIZI"
);

export const LoginWrapper = () => {
  const [session, setSession] = useState(null as Session | null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "SIGNED_IN" && session?.user.id) {
        window.location.href = "/";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <Stack mx="auto" maw="600" px="lg" pt="lg">
        <Title order={1}>Osogovo Con &apos;24</Title>
        <Text size="sm">Login or signup to host or join games</Text>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={["apple", "github", "google", "twitter"]}
        />
      </Stack>
    );
  } else {
    return <AppMain session={session} sb={supabase} />;
  }
};
