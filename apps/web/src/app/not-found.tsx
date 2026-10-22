import ErrorScreen from "@/components/errors/ErrorScreen";

/** Automatically rendered for an unknown URL or notFound() from a route. */
export default function NotFound() {
  return <ErrorScreen code={404} />;
}
