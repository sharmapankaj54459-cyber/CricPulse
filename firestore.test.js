const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_scorer_123";
const BOB_UID = "bob_spectator_456";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function emptyInnings(teamName) {
  return {
    battingTeam: teamName,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extrasWide: 0,
    extrasNoBall: 0,
    extrasBye: 0,
    extrasLegBye: 0,
    overRuns: [],
    overWickets: [],
    batters: [],
    bowlers: [],
    fallOfWickets: [],
  };
}

function validMatchPayload(ownerId, matchCode, now) {
  return {
    ownerId,
    matchCode,
    hostTeam: "Rampur Royals",
    visitorTeam: "Shastri XI",
    oversLimit: 10,
    playersPerTeam: 11,
    tossWinner: "Rampur Royals",
    tossDecision: "BAT",
    wideRuns: 1,
    noBallRuns: 1,
    reballWide: true,
    reballNoBall: true,
    lastManBatting: true,
    publicWatch: true,
    status: "LIVE",
    resultSummary: "1st Innings in progress",
    manOfTheMatch: "",
    currentInnings: 1,
    battingTeam: "Rampur Royals",
    bowlingTeam: "Shastri XI",
    totalRuns: 0,
    wickets: 0,
    legalBalls: 0,
    target: 0,
    strikerName: "Rohit",
    nonStrikerName: "Virat",
    bowlerName: "Bumrah",
    partnershipRuns: 0,
    partnershipBalls: 0,
    recentBalls: [],
    commentary: ["Match started!"],
    innings1: emptyInnings("Rampur Royals"),
    innings2: emptyInnings("Shastri XI"),
    createdAt: now,
    updatedAt: now,
  };
}

function validPlayerPayload(now) {
  return {
    name: "Rohit Sharma",
    role: "BATSMAN",
    teamName: "Rampur Royals",
    matches: 12,
    innings: 12,
    runs: 410,
    ballsFaced: 280,
    highestScore: 88,
    thirties: 4,
    fifties: 2,
    hundreds: 0,
    fours: 36,
    sixes: 22,
    notOuts: 2,
    wickets: 1,
    ballsBowled: 12,
    runsConceded: 14,
    bestBowlingWickets: 1,
    bestBowlingRuns: 14,
    catches: 6,
    runOuts: 2,
    createdAt: now,
    updatedAt: now,
  };
}

function validTournamentPayload(now) {
  return {
    name: "Gramin Premier League 2026",
    location: "Rampur Stadium",
    format: "LEAGUE",
    oversPerMatch: 10,
    pointsPerWin: 2,
    status: "ACTIVE",
    championTeam: "",
    manOfTheSeries: "",
    teams: [
      {
        name: "Rampur Royals",
        group: "A",
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        runsFor: 0,
        oversFor: 0.0,
        runsAgainst: 0,
        oversAgainst: 0.0,
        points: 0,
      },
    ],
    results: [],
    createdAt: now,
    updatedAt: now,
  };
}

function validSportMatchPayload(now) {
  return {
    sport: "KABADDI",
    teamA: "Rampur Raiders",
    teamB: "Kisan Bulls",
    scoreA: 34,
    scoreB: 29,
    periodLabel: "2nd Half",
    summary: "Rampur Raiders won by 5 points",
    winner: "Rampur Raiders",
    createdAt: now,
    updatedAt: now,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

// --- LIVE MATCHES TESTS ---

test("Unauthenticated user cannot read or write live_matches", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const now = new Date(Date.now() - 2000);
  await assertFails(unauthDb.collection("live_matches").doc("CP8821").get());
  await assertFails(
    unauthDb
      .collection("live_matches")
      .doc("CP8821")
      .set(validMatchPayload(ALICE_UID, "CP8821", now))
  );
});

test("Scorer creates, updates, and queries own live matches; spectator can watch by exact Match ID but cannot list or mutate", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);

  // Create match (no redundant id field)
  await assertSucceeds(
    aliceDb
      .collection("live_matches")
      .doc("CP8821")
      .set(validMatchPayload(ALICE_UID, "CP8821", created))
  );

  // Owner filtered list query succeeds; unfiltered list fails
  await assertSucceeds(
    aliceDb.collection("live_matches").where("ownerId", "==", ALICE_UID).get()
  );
  await assertFails(aliceDb.collection("live_matches").get());

  // Spectator Bob can get by exact Match ID when publicWatch == true
  await assertSucceeds(bobDb.collection("live_matches").doc("CP8821").get());
  // Spectator Bob cannot list Alice's matches or update Alice's match
  await assertFails(
    bobDb.collection("live_matches").where("ownerId", "==", ALICE_UID).get()
  );
  await assertFails(
    bobDb.collection("live_matches").doc("CP8821").update({
      totalRuns: 6,
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Owner updates live score cleanly
  await assertSucceeds(
    aliceDb.collection("live_matches").doc("CP8821").update({
      totalRuns: 6,
      legalBalls: 1,
      recentBalls: ["6"],
      commentary: ["0.1: Bumrah to Rohit — SIX!"],
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Reject ghost field (Shadow Update Test)
  await assertFails(
    aliceDb.collection("live_matches").doc("CP8821").update({
      totalRuns: 10,
      isVerified: true,
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Reject future timestamp
  await assertFails(
    aliceDb.collection("live_matches").doc("CP8821").update({
      totalRuns: 12,
      updatedAt: new Date(Date.now() + 120000),
    })
  );

  // Transition to COMPLETED and enforce Terminal State Locking
  await assertSucceeds(
    aliceDb.collection("live_matches").doc("CP8821").update({
      status: "COMPLETED",
      resultSummary: "Rampur Royals won by 24 runs",
      manOfTheMatch: "Rohit",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  await assertFails(
    aliceDb.collection("live_matches").doc("CP8821").update({
      totalRuns: 99,
      updatedAt: new Date(Date.now() - 200),
    })
  );
});

test("Private match cannot be read by another user even with exact Match ID", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);
  const payload = validMatchPayload(ALICE_UID, "CP9911", created);
  payload.publicWatch = false;

  await assertSucceeds(
    aliceDb.collection("live_matches").doc("CP9911").set(payload)
  );
  await assertFails(bobDb.collection("live_matches").doc("CP9911").get());
});

// --- PLAYER PROFILES TESTS ---

test("User-scoped players collection enforces ownership, schema, and immutable createdAt", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("players")
      .doc("player_1")
      .set(validPlayerPayload(created))
  );

  // Owner list & get succeed
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("players").get()
  );

  // Cross-user read & write denied
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("players").get()
  );
  await assertFails(
    bobDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("players")
      .doc("player_1")
      .update({ runs: 999, updatedAt: new Date(Date.now() - 500) })
  );

  // Owner partial update succeeds
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("players")
      .doc("player_1")
      .update({
        runs: 465,
        fifties: 3,
        updatedAt: new Date(Date.now() - 500),
      })
  );

  // Immutable createdAt mutation fails
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("players")
      .doc("player_1")
      .update({
        createdAt: new Date(Date.now() - 500),
        updatedAt: new Date(Date.now() - 500),
      })
  );
});

// --- TOURNAMENTS TESTS ---

test("User-scoped tournaments enforce ownership, terminal locking, and schema", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("tournaments")
      .doc("tourney_1")
      .set(validTournamentPayload(created))
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("tournaments").get()
  );
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("tournaments").get()
  );

  // Complete tournament -> then subsequent update blocked
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("tournaments")
      .doc("tourney_1")
      .update({
        status: "COMPLETED",
        championTeam: "Rampur Royals",
        manOfTheSeries: "Rohit",
        updatedAt: new Date(Date.now() - 500),
      })
  );

  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("tournaments")
      .doc("tourney_1")
      .update({
        manOfTheSeries: "Tampered",
        updatedAt: new Date(Date.now() - 100),
      })
  );
});

// --- MULTI-SPORT MATCHES TESTS ---

test("User-scoped sport_matches enforce ownership and valid sport enum", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("sport_matches")
      .doc("sm_1")
      .set(validSportMatchPayload(created))
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("sport_matches").get()
  );
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("sport_matches").get()
  );

  // Invalid sport enum fails
  const badSport = validSportMatchPayload(created);
  badSport.sport = "CHESS";
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("sport_matches")
      .doc("sm_2")
      .set(badSport)
  );
});
