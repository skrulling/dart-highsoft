import TournamentClient from './TournamentClient';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <TournamentClient tournamentId={id} />;
}
