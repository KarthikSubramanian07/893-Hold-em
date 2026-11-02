//! Agreement with independent evaluators on a committed fixture.
//!
//! `tests/oracle/pairs.txt` was produced by `tests/oracle/generate.mjs`, which
//! judges every pair with two unrelated JavaScript libraries and refuses to
//! write a fixture if they disagree. Here every line must match: both
//! categories and who wins.

use std::cmp::Ordering;

use hachi_engine::card::{Card, cards};
use hachi_engine::eval::{category_of, evaluate, score_best};

fn split(s: &str) -> Vec<Card> {
    let spaced: String = s
        .as_bytes()
        .chunks(2)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join(" ");
    cards(&spaced)
}

#[test]
fn agrees_with_the_oracle_on_every_fixture_pair() {
    let fixture = include_str!("oracle/pairs.txt");
    let mut checked = 0;
    let mut per_cat = [0u32; 9];
    let mut ties = 0;
    for (n, line) in fixture.lines().enumerate() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split_whitespace().collect();
        assert_eq!(f.len(), 6, "line {}: {line}", n + 1);
        let board = split(f[0]);
        let a: Vec<Card> = split(f[1])
            .into_iter()
            .chain(board.iter().copied())
            .collect();
        let b: Vec<Card> = split(f[2])
            .into_iter()
            .chain(board.iter().copied())
            .collect();
        let (cat_a, cat_b): (usize, usize) = (f[3].parse().unwrap(), f[4].parse().unwrap());
        let cmp: i32 = f[5].parse().unwrap();

        let (sa, sb) = (score_best(&a), score_best(&b));
        assert_eq!(
            category_of(sa) as usize,
            cat_a,
            "line {}: category of {a:?}",
            n + 1
        );
        assert_eq!(
            category_of(sb) as usize,
            cat_b,
            "line {}: category of {b:?}",
            n + 1
        );
        let ours = match sa.cmp(&sb) {
            Ordering::Greater => 1,
            Ordering::Equal => 0,
            Ordering::Less => -1,
        };
        assert_eq!(ours, cmp, "line {}: {a:?} vs {b:?}", n + 1);
        assert_eq!(evaluate(&a).score, sa);

        per_cat[cat_a] += 1;
        ties += (cmp == 0) as u32;
        checked += 1;
    }
    assert_eq!(checked, 20_000);
    // The fixture covers every category, and plenty of ties.
    assert!(
        per_cat.iter().all(|&c| c >= 100),
        "category coverage: {per_cat:?}"
    );
    assert!(ties >= 200, "ties: {ties}");
}
