//! Named edge cases, names, best-five selection, and random consistency checks.

use hachi_engine::card::{Card, Rng, cards, full_deck};
use hachi_engine::eval::{Category, HandValue, category_of, evaluate, score_best, score5};

fn score(s: &str) -> u32 {
    score_best(&cards(s))
}

fn eval(s: &str) -> HandValue {
    evaluate(&cards(s))
}

/// Assert the hand's category, name, and best five (in reading order).
fn check(hand: &str, category: Category, name: &str, best: &str) {
    let v = eval(hand);
    assert_eq!(v.category, category, "category of {hand}");
    assert_eq!(v.name, name, "name of {hand}");
    assert_eq!(v.best, cards(best), "best five of {hand}");
    assert_eq!(
        score5(v.best.clone().try_into().unwrap()),
        v.score,
        "best five scores the hand: {hand}"
    );
}

#[test]
fn names_and_best_five_for_every_category() {
    check(
        "As Kd 9c 7h 4s 3d 2c",
        Category::High,
        "Ace high",
        "As Kd 9c 7h 4s",
    );
    check(
        "Ks Jd 9c 7h 4s 3d 2c",
        Category::High,
        "King high",
        "Ks Jd 9c 7h 4s",
    );
    check(
        "7s 7d Ac Kh 4s 3d 2c",
        Category::Pair,
        "Pair of sevens",
        "7s 7d Ac Kh 4s",
    );
    check(
        "Ks Kd 7c 7h As 3d 2c",
        Category::TwoPair,
        "Two pair, kings and sevens",
        "Ks Kd 7h 7c As",
    );
    check(
        "Qs Qd Qc 9h 4s 3d 2c",
        Category::Trips,
        "Trip queens",
        "Qs Qd Qc 9h 4s",
    );
    check(
        "Ts 9d 8c 7h 6s 3d 2c",
        Category::Straight,
        "Straight, ten high",
        "Ts 9d 8c 7h 6s",
    );
    check(
        "As 2d 3c 4h 5s Kd Qc",
        Category::Straight,
        "Straight, five high",
        "5s 4h 3c 2d As",
    );
    check(
        "Ah Th 8h 5h 2h Kd Qc",
        Category::Flush,
        "Flush, ace high",
        "Ah Th 8h 5h 2h",
    );
    check(
        "7s 7d 7c Qh Qs 3d 2c",
        Category::FullHouse,
        "Full house, sevens full of queens",
        "7s 7d 7c Qs Qh",
    );
    check(
        "9s 9d 9c 9h As 3d 2c",
        Category::Quads,
        "Four nines",
        "9s 9h 9d 9c As",
    );
    check(
        "9h 8h 7h 6h 5h Kd Qc",
        Category::StraightFlush,
        "Straight flush, nine high",
        "9h 8h 7h 6h 5h",
    );
    check(
        "Ad Kd Qd Jd Td 9d 2c",
        Category::StraightFlush,
        "Royal flush",
        "Ad Kd Qd Jd Td",
    );
    check(
        "5c 4c 3c 2c Ac Kd Qh",
        Category::StraightFlush,
        "Straight flush, five high",
        "5c 4c 3c 2c Ac",
    );
}

#[test]
fn every_rank_name() {
    let singular = [
        "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen",
        "king", "ace",
    ];
    let plural = [
        "twos", "threes", "fours", "fives", "sixes", "sevens", "eights", "nines", "tens", "jacks",
        "queens", "kings", "aces",
    ];
    for r in 0..13u8 {
        // A pair of rank r with four unpaired low-ish kickers that never make a straight.
        let mut hand = vec![Card::new(r, 0), Card::new(r, 1)];
        let kickers: Vec<u8> = (0..13u8)
            .rev()
            .filter(|&k| k != r)
            .step_by(3)
            .take(3)
            .collect();
        for (i, k) in kickers.iter().enumerate() {
            hand.push(Card::new(*k, (i % 2 + 2) as u8));
        }
        let v = evaluate(&hand);
        assert_eq!(v.name, format!("Pair of {}", plural[r as usize]));

        // Four of a kind names the plural rank too.
        let kicker = if r == 0 { 1 } else { 0 };
        let quads = vec![
            Card::new(r, 0),
            Card::new(r, 1),
            Card::new(r, 2),
            Card::new(r, 3),
            Card::new(kicker, 0),
        ];
        assert_eq!(
            evaluate(&quads).name,
            format!("Four {}", plural[r as usize])
        );

        // High card names the singular top rank (skip ranks too low to top a non-straight).
        if r >= 6 {
            let below: Vec<u8> = [r - 1, r - 2, r - 4, r - 5].to_vec();
            let mut high = vec![Card::new(r, 0)];
            high.extend(
                below
                    .iter()
                    .enumerate()
                    .map(|(i, &k)| Card::new(k, (i % 3 + 1) as u8)),
            );
            let name = evaluate(&high).name;
            let mut cap = singular[r as usize].to_string();
            cap[..1].make_ascii_uppercase();
            assert_eq!(name, format!("{cap} high"));
        }
    }
}

#[test]
fn wheel_is_the_lowest_straight() {
    let wheel = score("As 2d 3c 4h 5s");
    let six = score("2d 3c 4h 5s 6d");
    assert!(six > wheel);
    // But a wheel still beats any trips.
    assert!(wheel > score("As Ad Ac Kh Qs"));
    // A-K-Q-J-T is the top straight; K-A-2-3-4 is not a straight.
    assert!(score("As Kd Qc Jh Ts") > score("Ks Qd Jc Th 9s"));
    assert_eq!(category_of(score("Ks Ad 2c 3h 4s")), Category::High);
    // A six-high straight that also contains a wheel plays six high.
    assert_eq!(eval("As 2d 3c 4h 5s 6d Kc").name, "Straight, six high");
}

#[test]
fn steel_wheel_is_the_lowest_straight_flush() {
    let steel = score("As 2s 3s 4s 5s");
    assert_eq!(category_of(steel), Category::StraightFlush);
    assert!(score("2s 3s 4s 5s 6s") > steel);
    assert!(steel > score("Ah Ad Ac As Ks"));
    // Every straight flush is distinct and ordered by high card.
    let sfs: Vec<u32> = (3..13u8)
        .map(|high| {
            let ranks: Vec<u8> = (0..5)
                .map(|i| if high == 3 && i == 4 { 12 } else { high - i })
                .collect();
            score5(std::array::from_fn(|i| Card::new(ranks[i], 2)))
        })
        .collect();
    assert!(sfs.windows(2).all(|w| w[0] < w[1]));
}

#[test]
fn flush_against_flush_comes_down_to_the_fifth_card() {
    let a = score("Ah Jh 9h 6h 4h Kd 2c");
    let b = score("Ah Jh 9h 6h 3h Kd 2c");
    assert!(a > b);
    // Same five in different suits tie.
    assert_eq!(score("As Js 9s 6s 4s"), score("Ac Jc 9c 6c 4c"));
    // A sixth suited card below the fifth does not count.
    assert_eq!(score("Ah Jh 9h 6h 4h 3h 2c"), score("Ah Jh 9h 6h 4h Kd Qc"));
    // A sixth suited card above the fifth replaces it.
    assert_eq!(eval("Ah Jh 9h 6h 4h 7h 2c").best, cards("Ah Jh 9h 7h 6h"));
}

#[test]
fn two_pair_with_three_pairs_on_board_keeps_the_best_kicker() {
    // Kings, sevens, and fives: the fives are dead; the kicker is the best of
    // the leftover cards (here the five beats the four).
    let v = eval("Ks Kd 7c 7h 5s 5d 4c");
    assert_eq!(v.name, "Two pair, kings and sevens");
    assert_eq!(v.best, cards("Ks Kd 7h 7c 5s"));
    // A higher lone card beats the third pair as the kicker.
    let w = eval("Ks Kd 7c 7h 5s 5d Qc");
    assert_eq!(w.best, cards("Ks Kd 7h 7c Qc"));
    assert!(w.score > v.score);
    // Shared board two pair: the player's kicker plays.
    assert!(score("Ac 2d Ks Kd 7c 7h 3s") > score("Qc 2h Ks Kd 7c 7h 3s"));
    // Counterfeited: board's third pair outranks the player's pair.
    assert_eq!(score("4c 4d Ks Kd 7c 7h Js"), score("2c 3d Ks Kd 7c 7h Js"));
}

#[test]
fn full_house_from_two_sets_takes_the_higher_set() {
    let v = eval("7s 7d 7c Qh Qs Qd 2c");
    assert_eq!(v.name, "Full house, queens full of sevens");
    assert_eq!(v.best, cards("Qs Qh Qd 7s 7d"));
    // Trips plus two pairs: the higher pair fills it.
    let w = eval("7s 7d 7c Qh Qs 2d 2c");
    assert_eq!(w.name, "Full house, sevens full of queens");
    // Higher trips win before the pair matters.
    assert!(score("8s 8d 8c 2h 2s") > score("7s 7d 7c Ah As"));
    assert!(score("8s 8d 8c 3h 3s") > score("8h 8d 8c 2h 2s"));
}

#[test]
fn quads_take_the_best_remaining_kicker() {
    let v = eval("9s 9d 9c 9h 3s 3d Kc");
    assert_eq!(v.name, "Four nines");
    assert_eq!(v.best, cards("9s 9h 9d 9c Kc"));
    // Quads on board: the higher hole kicker wins, a lower one plays the board.
    let board = "9s 9d 9c 9h 4s";
    assert!(score(&format!("{board} Ac 2d")) > score(&format!("{board} Kc Qd")));
    assert_eq!(
        score(&format!("{board} 3c 2d")),
        score(&format!("{board} 3h 2s"))
    );
    assert!(score("Ts Td Tc Th 2s") > score("9s 9d 9c 9h As"));
}

#[test]
fn straight_flush_beats_a_higher_offsuit_straight() {
    let sf = eval("9h 8h 7h 6h 5h Td Jc");
    assert_eq!(sf.category, Category::StraightFlush);
    assert_eq!(sf.name, "Straight flush, nine high");
    assert!(sf.score > score("Ad Kc Qh Js Th"));
    // The straight flush need not be the top straight in the hand.
    assert_eq!(sf.best, cards("9h 8h 7h 6h 5h"));
}

#[test]
fn kicker_resolution_for_pairs_and_trips() {
    assert!(score("As Ad Kc Qh 9s") > score("Ah Ac Kd Qs 8h"));
    assert_eq!(score("As Ad Kc Qh 9s 3d 2c"), score("Ah Ac Kd Qs 9h 4d 2s"));
    assert!(score("5s 5d 5c Ah 2s") > score("5h 5d 5c Kh Qs"));
    assert!(score("Ks Kd Qc Qh 3s") > score("Ks Kd Jc Jh As"));
    assert!(score("Ks Kd Qc Qh 4s") > score("Kh Kc Qs Qd 3s"));
    assert!(score("2s 2d 3c 4h 6s") > score("As Kd Qc Jh 9s"));
}

#[test]
fn serializes_like_the_typescript_types() {
    let json = serde_json::to_value(eval("Ks Kd 7c 7h As 3d 2c")).unwrap();
    assert_eq!(json["category"], "two-pair");
    assert_eq!(json["name"], "Two pair, kings and sevens");
    assert_eq!(
        json["best"],
        serde_json::json!(["Ks", "Kd", "7h", "7c", "As"])
    );
    let names: Vec<String> = Category::ALL
        .iter()
        .map(|c| serde_json::to_string(c).unwrap())
        .collect();
    assert_eq!(
        names,
        [
            "\"high\"",
            "\"pair\"",
            "\"two-pair\"",
            "\"trips\"",
            "\"straight\"",
            "\"flush\"",
            "\"full-house\"",
            "\"quads\"",
            "\"straight-flush\""
        ]
    );
    let back: HandValue = serde_json::from_value(json).unwrap();
    assert_eq!(back, eval("Ks Kd 7c 7h As 3d 2c"));
}

fn subsets5(hand: &[Card]) -> impl Iterator<Item = [Card; 5]> + '_ {
    let n = hand.len();
    (0u32..1 << n)
        .filter(|m| m.count_ones() == 5)
        .map(move |m| {
            let picked: Vec<Card> = (0..n)
                .filter(|i| m & (1 << i) != 0)
                .map(|i| hand[i])
                .collect();
            picked.try_into().unwrap()
        })
}

#[test]
fn best_of_seven_is_the_max_over_all_five_card_subsets() {
    let mut rng = Rng::seeded(0x893);
    let mut deck = full_deck();
    for round in 0..20_000 {
        rng.shuffle(&mut deck);
        let n = 5 + round % 3;
        let hand = &deck[..n];
        let best = score_best(hand);
        let max = subsets5(hand).map(score5).max().unwrap();
        assert_eq!(best, max, "{hand:?}");

        let v = evaluate(hand);
        assert_eq!(v.score, best);
        assert_eq!(v.category, category_of(best));
        assert_eq!(v.best.len(), 5);
        assert!(
            v.best.iter().all(|c| hand.contains(c)),
            "best is a subset of {hand:?}"
        );
        let mut uniq = v.best.clone();
        uniq.sort();
        uniq.dedup();
        assert_eq!(uniq.len(), 5);
        assert_eq!(
            score5(v.best.clone().try_into().unwrap()),
            best,
            "{hand:?} -> {:?}",
            v.best
        );
        // Order does not matter to the scorer.
        let mut rev = hand.to_vec();
        rev.reverse();
        assert_eq!(score_best(&rev), best);
    }
}

#[test]
fn best_five_reads_made_part_first_then_kickers_high_to_low() {
    let mut rng = Rng::seeded(7);
    let mut deck = full_deck();
    for _ in 0..20_000 {
        rng.shuffle(&mut deck);
        let v = evaluate(&deck[..7]);
        let r: Vec<u8> = v.best.iter().map(|c| c.rank()).collect();
        let desc = |s: &[u8]| s.windows(2).all(|w| w[0] > w[1]);
        match v.category {
            Category::High | Category::Flush => assert!(desc(&r)),
            Category::Pair => assert!(r[0] == r[1] && desc(&r[2..]) && !r[2..].contains(&r[0])),
            Category::TwoPair => {
                assert!(r[0] == r[1] && r[2] == r[3] && r[1] > r[2] && r[4] != r[0] && r[4] != r[2])
            }
            Category::Trips => {
                assert!(r[0] == r[1] && r[1] == r[2] && desc(&r[3..]) && !r[3..].contains(&r[0]))
            }
            Category::FullHouse => assert!(r[0] == r[1] && r[1] == r[2] && r[3] == r[4]),
            Category::Quads => assert!(r[..4].iter().all(|&x| x == r[0]) && r[4] != r[0]),
            Category::Straight | Category::StraightFlush => {
                if r == [3, 2, 1, 0, 12] {
                    continue;
                }
                assert!(r.windows(2).all(|w| w[0] == w[1] + 1), "{:?}", v.best);
            }
        }
    }
}

// The House can hold up to five cards, so with the board a hand can be ten
// cards. Past seven, a flush no longer rules out a full house or quads.
#[test]
fn ten_cards_full_house_beats_a_flush_on_the_same_table() {
    check(
        "Ah Kh 9h 5h 2h As Ad Ks Kd 3c",
        Category::FullHouse,
        "Full house, aces full of kings",
        "As Ah Ad Ks Kh",
    );
}

#[test]
fn ten_cards_quads_beat_a_flush() {
    check(
        "Qh Jh 8h 6h 3h Qs Qd Qc 7c 2s",
        Category::Quads,
        "Four queens",
        "Qs Qh Qd Qc Jh",
    );
}

#[test]
fn ten_cards_two_flush_suits_take_the_better_one() {
    check(
        "Ah Jh 9h 7h 4h Ks Qs Ts 8s 6s",
        Category::Flush,
        "Flush, ace high",
        "Ah Jh 9h 7h 4h",
    );
    check(
        "9s 8s 7s 6s 5s Ah Kh Qh Jh 2h",
        Category::StraightFlush,
        "Straight flush, nine high",
        "9s 8s 7s 6s 5s",
    );
}

#[test]
fn ten_cards_agree_with_the_best_five_card_subset() {
    let mut rng = Rng::seeded(31);
    for _ in 0..3000 {
        let mut deck = full_deck();
        rng.shuffle(&mut deck);
        let hand: Vec<Card> = deck[..10].to_vec();
        let mut best = 0;
        for a in 0..10 {
            for b in a + 1..10 {
                for c in b + 1..10 {
                    for d in c + 1..10 {
                        for e in d + 1..10 {
                            best = best.max(score5([hand[a], hand[b], hand[c], hand[d], hand[e]]));
                        }
                    }
                }
            }
        }
        assert_eq!(score_best(&hand), best, "{hand:?}");
        assert_eq!(evaluate(&hand).score, best);
    }
}

#[test]
fn twelve_cards_agree_with_the_best_five_card_subset() {
    // The House holds up to seven cards at a full Oyabun table.
    let mut rng = Rng::seeded(37);
    for _ in 0..400 {
        let mut deck = full_deck();
        rng.shuffle(&mut deck);
        let hand: Vec<Card> = deck[..12].to_vec();
        let mut best = 0;
        for a in 0..12 {
            for b in a + 1..12 {
                for c in b + 1..12 {
                    for d in c + 1..12 {
                        for e in d + 1..12 {
                            best = best.max(score5([hand[a], hand[b], hand[c], hand[d], hand[e]]));
                        }
                    }
                }
            }
        }
        assert_eq!(score_best(&hand), best, "{hand:?}");
        assert_eq!(evaluate(&hand).score, best);
    }
}
