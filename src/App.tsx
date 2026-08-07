import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  ThemeIcon,
  Anchor,
  Box,
  ActionIcon,
  Divider,
  Paper,
  Button,
} from "@mantine/core";
import VideoForm from "./components/VideoForm";
import VideosList from "./components/VideosList";
import VideoModal from "./components/VideoModal";
import ApiPage from "./components/ApiPage";
import SparkleTitle from "./components/SparkleTitle";
import GitHubCorner from "./components/GitHubCorner";
import ConvexCorner from "./components/ConvexCorner";
import { routes, useRoute } from "./router";

const Logo = () => (
  <ThemeIcon size="md" radius="sm" color="red">
    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  </ThemeIcon>
);

const GitHubIcon = () => (
  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

function NavLink({
  href,
  onClick,
  active,
  children,
}: {
  href: string;
  onClick: (e: React.MouseEvent) => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Anchor
      href={href}
      onClick={onClick}
      size="sm"
      fw={500}
      underline="never"
      px="sm"
      py={6}
      c={active ? "white" : "dimmed"}
      style={{
        borderRadius: "var(--mantine-radius-md)",
        backgroundColor: active ? "var(--mantine-color-dark-5)" : "transparent",
        transition: "background-color 150ms, color 150ms",
      }}
    >
      {children}
    </Anchor>
  );
}

const Header = () => {
  const route = useRoute();
  const isApi = route.name === "api";

  return (
    <Box
      component="header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid var(--mantine-color-dark-5)",
        backgroundColor: "rgba(26, 27, 30, 0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Container size="xl">
        <Group h={56} justify="space-between">
          <Anchor
            href={routes.home({}).href}
            onClick={(e) => { e.preventDefault(); routes.home({}).push(); }}
            underline="never"
            c="white"
          >
            <Group gap="xs">
              <Logo />
              <Text fw={700} size="sm">Video to Markdown</Text>
            </Group>
          </Anchor>

          <Group gap={4}>
            <NavLink
              href={routes.home({}).href}
              onClick={(e) => { e.preventDefault(); routes.home({}).push(); }}
              active={!isApi}
            >
              Generator
            </NavLink>
            <NavLink
              href={routes.api().href}
              onClick={(e) => { e.preventDefault(); routes.api().push(); }}
              active={isApi}
            >
              API
            </NavLink>
            <ActionIcon
              component="a"
              href="https://github.com/mikecann/video-to-markdown"
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="View source on GitHub"
            >
              <GitHubIcon />
            </ActionIcon>
          </Group>
        </Group>
      </Container>
    </Box>
  );
};

const Footer = () => {
  const route = useRoute();
  const isApi = route.name === "api";

  return (
    <Box component="footer" mt="xl" py="xl" style={{ borderTop: "1px solid var(--mantine-color-dark-5)" }}>
      <Container size="xl">
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="xs">
            <Logo />
            <Text size="sm" fw={600} c="dimmed">Video to Markdown</Text>
          </Group>
          <Group gap="lg">
            <Anchor
              href={routes.home({}).href}
              onClick={(e) => { e.preventDefault(); routes.home({}).push(); }}
              size="sm"
              c={!isApi ? "white" : "dimmed"}
              underline="never"
            >
              Generator
            </Anchor>
            <Anchor
              href={routes.api().href}
              onClick={(e) => { e.preventDefault(); routes.api().push(); }}
              size="sm"
              c={isApi ? "white" : "dimmed"}
              underline="never"
            >
              API
            </Anchor>
            <Divider orientation="vertical" />
            <Anchor
              href="https://github.com/mikecann/video-to-markdown"
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              c="dimmed"
              underline="never"
            >
              GitHub
            </Anchor>
            <Anchor
              href="https://convex.dev"
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              c="dimmed"
              underline="never"
            >
              Built with Convex
            </Anchor>
          </Group>
        </Group>
        <Text size="xs" c="dark.3" mt="md">
          © {new Date().getFullYear()} Video to Markdown. Free and open source.
        </Text>
      </Container>
    </Box>
  );
};

const HeroSection = () => (
  <Stack align="center" gap="lg" py="xl">
    <SparkleTitle order={1} fw={900} ta="center" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)" }}>
      Video to Markdown
    </SparkleTitle>
    <Text size="lg" c="dimmed" maw={540} ta="center" lh={1.7}>
      Paste a YouTube URL and get a beautiful markdown snippet with a
      decorated thumbnail - perfect for READMEs, docs, and blog posts.
    </Text>
  </Stack>
);

const VideosSection = () => (
  <Stack gap="md">
    <Title order={3}>Generated Videos</Title>
    <VideosList />
  </Stack>
);

const ConvexPromo = () => (
  <Paper
    component="aside"
    p={{ base: "lg", sm: "xl" }}
    radius="lg"
    withBorder
    style={{
      borderColor: "rgba(255, 107, 107, 0.22)",
      background:
        "linear-gradient(120deg, rgba(250, 82, 82, 0.12), rgba(37, 38, 43, 0.82) 55%)",
    }}
  >
    <Group justify="space-between" align="center" gap="xl" wrap="wrap">
      <Group align="flex-start" gap="md" wrap="nowrap" style={{ flex: "1 1 480px" }}>
        <Box
          p="sm"
          style={{
            flex: "0 0 auto",
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "rgba(0, 0, 0, 0.22)",
          }}
        >
          <img src="/convex.svg" alt="Convex" width={38} height={38} style={{ display: "block" }} />
        </Box>
        <Stack gap={5}>
          <Title order={2} size="h3">Powered by Convex</Title>
          <Text c="dimmed" maw={650} lh={1.6}>
            Convex processes each video, coordinates thumbnail storage, and keeps every image
            fresh with automatic background checks.
          </Text>
        </Stack>
      </Group>

      <Group gap="sm" wrap="wrap">
        <Button
          component="a"
          href="https://youtu.be/KQVRDdmrIo4"
          target="_blank"
          rel="noopener noreferrer"
          color="red"
          variant="light"
        >
          Watch how it was built
        </Button>
        <Button
          component="a"
          href="https://convex.dev"
          target="_blank"
          rel="noopener noreferrer"
          color="gray"
          variant="subtle"
        >
          Build with Convex
        </Button>
      </Group>
    </Group>
  </Paper>
);

export default function App() {
  const route = useRoute();
  const videoParam = route.name === "home" ? route.params.video : undefined;
  const isApi = route.name === "api";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ConvexCorner />
      <GitHubCorner />
      <Header />
      <Box style={{ flex: 1 }}>
        <Container size="xl" py="xl">
          <Stack gap="xl">
            {!isApi && <HeroSection />}
            {isApi ? (
              <ApiPage />
            ) : (
              <>
                <VideoForm />
                <ConvexPromo />
                <VideosSection />
              </>
            )}
          </Stack>
        </Container>
      </Box>
      <Footer />
      {videoParam && <VideoModal videoId={videoParam} />}
    </div>
  );
}
