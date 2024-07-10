"use client";

// import "./index.css";
import { useState, useEffect } from "react";
import { Session, createClient } from "@supabase/supabase-js";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeMinimal } from "@supabase/auth-ui-shared";
import { Stack, Text, Title } from "@mantine/core";
import { AppMain } from "../AppMain";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
          appearance={{ theme: ThemeMinimal }}
          providers={[]} // "apple", "github", "google", "twitter"
        />
      </Stack>
    );
  } else {
    return <AppMain session={session} sb={supabase} />;
  }
};
