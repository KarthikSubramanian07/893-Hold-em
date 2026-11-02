//! Monte Carlo odds: known equities, lowball, known cards, determinism.

use hachi_engine::card::{Card, Rng, cards};
use hachi_engine::equity::{Odds, Spot, estimate};

fn hole(s: &str) -> [Card; 2] {
    cards(s).try_into().unwrap()
}

const HIDDEN: [Option<Card>; 2] = [None, None];

fn run(spot: &Spot, samples: u32, seed: u64) -> Odds {
    let odds = estimate(spot, samples, &mut Rng::seeded(seed));
    assert!(
        (odds.win + odds.tie + odds.lose - 1.0).abs() < 1e-9,
        "{odds:?}"
    );
    odds
}

fn heads_up(hand: &str, lowball: bool) -> Odds {
    let house = [HIDDEN];
    let spot = Spot {
        hole: hole(hand),
        board: &[],
        board_total: 5,
        house: &house,
        dead: &[],
        lowball,
    };
    run(&spot, 200_000, 1)
}

#[test]
fn aces_win_about_85_percent_heads_up() {
    // Known AA vs a random hand: 85.2% win, 0.5% tie.
    let odds = heads_up("As Ah", false);
    assert!((odds.win - 0.852).abs() < 0.015, "{odds:?}");
    assert!(odds.tie < 0.02, "{odds:?}");
}

#[test]
fn seven_deuce_offsuit_wins_about_a_third() {
    // Known 72o vs a random hand: about 31.7% win and 5.8% ties, for 34.6%
    // equity once ties split the pot.
    let odds = heads_up("7s 2h", false);
    assert!((odds.win - 0.317).abs() < 0.015, "{odds:?}");
    let equity = odds.win + odds.tie / 2.0;
    assert!((0.32..=0.35).contains(&equity), "{odds:?}");
}

#[test]
fn lowball_flips_the_ordering() {
    let high = heads_up("As Ah", false);
    let low = heads_up("As Ah", true);
    // Same seed, same deals: lowball swaps every win for a loss exactly.
    assert_eq!(low.win, high.lose);
    assert_eq!(low.lose, high.win);
    assert_eq!(low.tie, high.tie);
    assert!(low.win < 0.16, "{low:?}");
    let trash = heads_up("7s 2h", true);
    assert!(trash.win > 0.6, "{trash:?}");
}

#[test]
fn everything_known_is_exact() {
    let board = cards("Ks Qd 7c 4h 2s");
    // Player has a pair of kings; the House has trip queens and trip sevens.
    let house = [
        [Card::parse("Qh"), Card::parse("Qc")],
        [Card::parse("7d"), Card::parse("7h")],
    ];
    let spot = Spot {
        hole: hole("Kh 9c"),
        board: &board,
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    assert_eq!(
        run(&spot, 2_000, 3),
        Odds {
            win: 0.0,
            tie: 0.0,
            lose: 1.0
        }
    );

    // Lowball: the House plays its weakest hand, trip sevens, and the
    // player's pair of kings is weaker still, so the player wins.
    let spot = Spot {
        lowball: true,
        ..spot
    };
    assert_eq!(
        run(&spot, 2_000, 3),
        Odds {
            win: 1.0,
            tie: 0.0,
            lose: 0.0
        }
    );

    // Same hand on both sides of a played board: an exact tie.
    let board = cards("As Ks Qs Js Ts");
    let house = [[Card::parse("2c"), Card::parse("3c")]];
    let spot = Spot {
        hole: hole("2d 3d"),
        board: &board,
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    assert_eq!(
        run(&spot, 50, 9),
        Odds {
            win: 0.0,
            tie: 1.0,
            lose: 0.0
        }
    );
}

#[test]
fn known_and_dead_cards_leave_the_deck() {
    // The player holds the nut flush draw on the turn; the House shows both
    // cards. Counting outs by hand: 9 hearts left minus the dead ones.
    let board = cards("Kh 7h 2c 4s");
    let house = [[Card::parse("Qs"), Card::parse("Qd")]];
    let dead = cards("3h 5h 9h");
    let spot = Spot {
        hole: hole("Ah Jh"),
        board: &board,
        board_total: 5,
        house: &house,
        dead: &dead,
        lowball: false,
    };
    // Live river cards: 52 - 2 - 4 - 2 - 3 = 41. Player wins with the 6 live
    // hearts and the 3 live aces (a jack only makes a pair below the queens):
    // 9 of 41.
    let odds = run(&spot, 200_000, 4);
    assert!((odds.win - 9.0 / 41.0).abs() < 0.005, "{odds:?}");
    assert_eq!(odds.tie, 0.0);
}

#[test]
fn more_house_hands_are_harder_to_beat() {
    let one = [HIDDEN];
    let three = [HIDDEN, HIDDEN, HIDDEN];
    let base = Spot {
        hole: hole("Ks Qs"),
        board: &[],
        board_total: 5,
        house: &one,
        dead: &[],
        lowball: false,
    };
    let vs1 = run(&base, 50_000, 5);
    let vs3 = run(
        &Spot {
            house: &three,
            ..base
        },
        50_000,
        5,
    );
    assert!(vs3.win < vs1.win - 0.15, "{vs1:?} {vs3:?}");
    // KQs vs one random hand is about 63% to win.
    assert!((vs1.win - 0.63).abs() < 0.02, "{vs1:?}");
}

#[test]
fn partial_boards_and_short_boards() {
    // Flop, one House hand with a face-up card: still sums to one.
    let board = cards("2c 7d Js");
    let house = [[Card::parse("Ah"), None]];
    let spot = Spot {
        hole: hole("Jh Jc"),
        board: &board,
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    let odds = run(&spot, 20_000, 6);
    assert!(odds.win > 0.85, "{odds:?}");
    // board_total equal to the visible board: no more board cards are dealt.
    let spot = Spot {
        board_total: 3,
        ..spot
    };
    let flop_only = run(&spot, 20_000, 6);
    assert!(flop_only.win > 0.9, "{flop_only:?}");
}

#[test]
fn deterministic_for_a_seed() {
    let house = [HIDDEN, [Card::parse("Td"), None]];
    let spot = Spot {
        hole: hole("9s 9h"),
        board: &[],
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    assert_eq!(run(&spot, 2_000, 42), run(&spot, 2_000, 42));
    assert_ne!(run(&spot, 2_000, 42), run(&spot, 2_000, 43));
}

#[test]
fn no_house_hands_means_the_player_wins() {
    let spot = Spot {
        hole: hole("2s 3h"),
        board: &[],
        board_total: 5,
        house: &[],
        dead: &[],
        lowball: false,
    };
    assert_eq!(
        run(&spot, 10, 1),
        Odds {
            win: 1.0,
            tie: 0.0,
            lose: 0.0
        }
    );
}
