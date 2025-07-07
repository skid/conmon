import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";

import { Button, Flex, Group, NumberInput, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  IconArrowLeft,
  IconCheck,
  IconDice6,
  IconDoorEnter,
  IconDoorExit,
  IconPencil,
  IconShoe,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { DateTimePicker } from "@mantine/dates";
import dayjs from "dayjs";

type Profile = {
  id: string;
  name: string;
  username: string;
};

type Sess = {
  id?: number;
  game: string;
  player_count: number;
  comment: string;
  start_time: Date;
  author_id: string;
  profiles: Profile[];
};

/**
 * Fetches and refreshes all game sessions
 */
const useSessions = (sb: SupabaseClient) => {
  const [error, setError] = useState(null as string | null);
  const [sessions, setSessions] = useState([] as Sess[]);

  const fetchSessions = async () => {
    const { data, error } = await sb
      .from("sessions")
      .select(`*, profiles:profiles!sessions_profiles(*)`)
      .filter("start_time", "gt", new Date().toISOString())
      .order("start_time", { ascending: true });
    if (error) {
      setError(error.message);
      setSessions([]);
    } else {
      setError(null);
      setSessions(data);
    }
  };

  useEffect(() => {
    const channel = sb
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, fetchSessions)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const channel = sb
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions_profiles" }, () => {
        fetchSessions();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchSessions();
  }, []);

  return {
    sessions: sessions.map((s) => ({ ...s, start_time: new Date(s.start_time + "Z") })),
    error,
  };
};

/**
 * Fetches and refreshes profile data
 */
const useProfile = (sb: SupabaseClient, userId: string) => {
  const [error, setError] = useState(null as string | null);
  const [profile, setProfile] = useState(null as null | { username: string; name: string; id?: number });

  const fetchProfile = async () => {
    const { data, error } = await sb.from("profiles").select("*").filter("id", "eq", userId);

    if (error) {
      setError(error.message);
      setProfile(null);
    } else {
      const p = data[0];
      if (!p) {
        setProfile(null);
      } else if (p.name !== profile?.name || p.username !== profile?.username) {
        setProfile(data[0]);
      }
    }
  };

  useEffect(() => {
    const channel = sb
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchProfile)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchProfile();
  }, []);

  return { profile, error, fetchProfile };
};

export const AppMain = ({ session, sb }: { session: Session; sb: SupabaseClient }) => {
  const [loading, setLoading] = useState(false);
  const [sessId, setSessId] = useState<number | null>(null);
  const [profEd, setProfEd] = useState(false);

  const { profile, fetchProfile } = useProfile(sb, session.user.id);
  const { sessions, error } = useSessions(sb);
  const editedSession = sessions.find((s) => s.id === sessId);

  const sessionForm = useForm({
    initialValues: {
      game: "",
      player_count: 2,
      comment: "",
      start_time: new Date(),
    },
    validate: {
      game: (value) => (value.length > 0 ? null : "Required"),
      player_count: (value) => (value >= 2 ? null : "At least 2 players"),
      start_time: (value) => {
        if (!(value instanceof Date)) {
          return "Required";
        }
        if (+value < +new Date()) {
          return "Cannot be in the past";
        }
      },
    },
  });

  const profileForm = useForm({
    initialValues: {
      id: profile?.id ?? undefined,
      name: profile?.name || "",
      username: profile?.username || "",
    },
    validate: { username: (value) => (value ? null : "Required") },
  });

  const saveSession = async (values: Partial<Sess>) => {
    setLoading(true);
    let { data, error } = await sb
      .from("sessions")
      .upsert({ ...values, author_id: session.user.id, ...(sessId ? { id: sessId } : {}) })
      .select();

    if (!error) {
      const session_id = (data as any)[0].id;
      ({ data, error } = await sb
        .from("sessions_profiles")
        .upsert({ profile_id: session.user.id, session_id })
        .select());

      if (error) {
        // poor man's transactions
        await sb.from("sessions").delete().eq("id", session_id);
      }
    }

    setLoading(false);
    if (error) {
      notifications.show({ title: "Error", message: error.message, color: "red", icon: <IconX /> });
    } else {
      sessionForm.reset();
      setSessId(null);
    }
  };

  const saveProfile = async (values: { id?: number | null; name: string; username: string }) => {
    setLoading(true);
    const { data, error } = await sb.from("profiles").upsert({ ...values, id: session.user.id });
    setLoading(false);

    if (error) {
      const message = error.code === "23505" ? "Username already taken" : error.message;
      notifications.show({ title: "Error", message, color: "red", icon: <IconX /> });
    } else {
      await fetchProfile();
      setProfEd(false);
    }
  };

  const cancelSession = async (id: number) => {
    if (id && !confirm("Are you sure you want to delete this game?")) {
      return;
    }
    await sb.from("sessions").delete().eq("id", id);
    setSessId(null);
  };

  const changeSession = (id?: number) => {
    if (!profile) {
      setProfEd(true);
    } else if (id) {
      const sess = sessions.find((s) => s.id === id);
      if (sess) {
        sessionForm.setValues({
          game: sess.game,
          comment: sess.comment,
          player_count: sess.player_count,
          start_time: sess.start_time,
        });
        setSessId(id);
      }
    }
  };

  const changeProfile = () => {
    profileForm.setValues({
      id: profile?.id,
      name: profile?.name || "",
      username: profile?.username || "",
    });
    setProfEd(true);
  };

  const joinOrLeaveSession = async (session_id: number, join = true) => {
    if (!profile) {
      setProfEd(true);
    } else if (session_id) {
      const { error } = join
        ? await sb.from("sessions_profiles").upsert({ profile_id: session.user.id, session_id }).select()
        : await sb
            .from("sessions_profiles")
            .delete()
            .eq("profile_id", session.user.id)
            .eq("session_id", session_id)
            .select();

      if (error) {
        notifications.show({
          title: "Error",
          message: error.message,
          color: "red",
          icon: <IconX />,
        });
      }
    }
  };

  const kickPlayer = (session_id: number, profile_id: string) => async () => {
    const { error } = await sb
      .from("sessions_profiles")
      .delete()
      .eq("profile_id", profile_id)
      .eq("session_id", session_id)
      .select();

    if (error) {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
        icon: <IconX />,
      });
    }
  };

  return (
    <Stack mx="auto" maw="600" px="sm" mt="lg">
      {profEd ? (
        <>
          <Title order={1}>Your Profile</Title>
          <Text size="sm" mb="sm">
            Your email is {session.user.email}
          </Text>
          <form onSubmit={profileForm.onSubmit(saveProfile)}>
            <TextInput
              label="Nickname"
              description="How do people call you?"
              size="xs"
              withAsterisk
              {...profileForm.getInputProps("username")}
            />
            <TextInput
              label="Real Name"
              description="Real name? (optional)"
              size="xs"
              {...profileForm.getInputProps("name")}
            />
            <Flex gap="sm" mt="sm">
              <Button size="xs" loading={loading} type="submit" rightSection={<IconCheck />} color="blue">
                Update
              </Button>
              {!!profileForm.values.id && (
                <Button
                  size="xs"
                  rightSection={<IconArrowLeft />}
                  color="gray"
                  ml="auto"
                  onClick={() => setProfEd(false)}
                >
                  Back
                </Button>
              )}
            </Flex>
          </form>
        </>
      ) : sessId === null ? (
        <>
          <Title order={3}>Осогово Con &apos;25</Title>
          <Group gap="xs">
            <Button
              size="xs"
              leftSection={<IconDice6 size={16} />}
              onClick={() => (profile ? setSessId(0) : setProfEd(true))}
            >
              Host Game
            </Button>
            <Button size="xs" ml="auto" leftSection={<IconUser size={16} />} color="blue" onClick={changeProfile}>
              Profile
            </Button>
          </Group>
          <Stack gap="sm">
            {sessions.map((sess) => (
              <Flex
                key={sess.id}
                direction="column"
                p="md"
                style={{ border: "solid 1px #eee", borderRadius: 10, boxShadow: "0 0 5px #eee" }}
              >
                <Title order={2}>{sess.game}</Title>
                <Flex>
                  <Text size="sm">{dayjs(sess.start_time).format("dddd HH:mm")}</Text>
                  <Text size="sm" ml="auto">
                    {dayjs(sess.start_time).format("DD/MM/YYYY")}
                  </Text>
                </Flex>
                <Text size="sm">
                  <b>
                    {sess.profiles.length}/{sess.player_count}
                  </b>
                  {" Players: "}
                  {sess.profiles.map((p) => (
                    <span
                      key={p.id}
                      style={{
                        display: "block",
                        fontWeight: "bold",
                        color: p.id === session.user.id ? "green" : "black",
                        margin: "0 5px",
                      }}
                    >
                      {p.username} <small>({p.name})</small>
                      {p.id === sess.author_id ? " (host)" : ""}
                      {p.id === session.user.id ? " (you)" : ""}
                      {", "}
                    </span>
                  ))}
                </Text>
                {sess.comment && (
                  <Text size="sm" mt="xs">
                    {sess.comment}
                  </Text>
                )}
                <Group mt="xs">
                  {sess.author_id === session.user.id ? (
                    <Button
                      ml="auto"
                      size="xs"
                      color="blue"
                      rightSection={<IconPencil size={16} />}
                      onClick={() => changeSession(sess.id)}
                    >
                      Change
                    </Button>
                  ) : sess.profiles.find((p) => p.id === session.user.id) ? (
                    <Button
                      ml="auto"
                      size="xs"
                      color="red"
                      rightSection={<IconDoorExit size={16} />}
                      onClick={() => joinOrLeaveSession(sess.id!, false)}
                    >
                      Leave
                    </Button>
                  ) : sess.profiles.length === sess.player_count ? (
                    <Text ml="auto" size="xs" fw="bold" c="green">
                      Game Full
                    </Text>
                  ) : !sess.profiles.find((p) => p.id === session.user.id) ? (
                    <Button
                      ml="auto"
                      size="xs"
                      color="green"
                      rightSection={<IconDoorEnter size={16} />}
                      onClick={() => joinOrLeaveSession(sess.id!)}
                    >
                      Join
                    </Button>
                  ) : (
                    <></>
                  )}
                </Group>
              </Flex>
            ))}
          </Stack>
        </>
      ) : (
        <>
          <Title order={1}>{sessId === 0 ? "New Session" : "Session"}</Title>
          <form onSubmit={sessionForm.onSubmit(saveSession)}>
            <TextInput
              label="Game"
              description="Which game are you playing?"
              size="xs"
              withAsterisk
              {...sessionForm.getInputProps("game")}
            />
            <NumberInput
              label="Players"
              description="Maximum number of players"
              size="xs"
              withAsterisk
              {...sessionForm.getInputProps("player_count")}
            />
            <DateTimePicker
              label="Start Time"
              description="When is the session starting?"
              size="xs"
              withAsterisk
              {...sessionForm.getInputProps("start_time")}
            />
            <Textarea
              label="Comment"
              description="Other info: rules, location, etc."
              size="xs"
              {...sessionForm.getInputProps("comment")}
            />
            {editedSession && (
              <>
                <Text my="sm">
                  Players ({editedSession.profiles.length}/{editedSession.player_count})
                </Text>
                <Flex gap="xs" align="center" mt="xs">
                  <Text>You</Text>
                </Flex>
                {editedSession.profiles
                  .filter((p) => p.id !== editedSession.author_id)
                  .map((p) => {
                    return (
                      <Flex key={p.id} gap="xs" align="center" mt="xs">
                        <Text>{p.username}</Text>
                        <Button
                          size="xs"
                          color="red"
                          ml="auto"
                          rightSection={<IconShoe size={16} />}
                          onClick={kickPlayer(editedSession.id!, p.id)}
                        >
                          Kick
                        </Button>
                      </Flex>
                    );
                  })}
              </>
            )}
            <Flex gap="sm" mt="md" pt="md" style={{ borderTop: "solid 1px #ccc" }}>
              {sessId === 0 ? (
                <Button loading={loading} type="submit" rightSection={<IconCheck />} color="blue">
                  Create
                </Button>
              ) : editedSession && editedSession.author_id === session.user.id ? (
                <>
                  <Button loading={loading} type="submit" rightSection={<IconCheck />} color="blue">
                    Save
                  </Button>
                  <Button
                    ml="auto"
                    color="red"
                    rightSection={<IconX size={16} />}
                    onClick={() => cancelSession(sessId)}
                  >
                    Delete
                  </Button>
                </>
              ) : (
                <></>
              )}

              <Button
                rightSection={<IconArrowLeft />}
                color="gray"
                ml="auto"
                onClick={() => {
                  setSessId(null);
                  sessionForm.reset();
                }}
              >
                Back
              </Button>
            </Flex>
          </form>
        </>
      )}
    </Stack>
  );
};
