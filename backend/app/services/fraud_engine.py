from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import joblib
import networkx as nx
import numpy as np
import pandas as pd
import shap
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from sklearn.ensemble import IsolationForest
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import QuantileTransformer, StandardScaler

Decision = Literal["APPROVE", "REVIEW", "REJECT"]


@dataclass
class FraudPredictionResult:
    risk_score: int
    decision: Decision
    reasons: list[str]
    calibrated_probability: float
    raw_score: float
    rule_flag: int
    rule_reason: str
    model_version: str
    trained_at_utc: str | None
    training_data_source: str
    db_records: int


class HybridFraudEngine:
    """
    Complete end-to-end hybrid fraud engine.

    Layers:
      1) Rules
      2) Feature engineering
      3) CatBoost + LightGBM
      4) IsolationForest + Autoencoder (MLP)
      5) Graph intelligence
      6) Temporal intelligence
      7) Meta model stacking
      8) Isotonic calibration
      9) Decision engine
      10) SHAP explainability
    """

    REQUIRED_COLUMNS = {
        "user_id",
        "claim_amount",
        "claim_time",
        "device_id",
        "ip_address",
        "location",
        "claims_last_7d",
        "claims_last_30d",
        "account_age",
        "historical_avg_claim_amount",
    }

    FEATURE_COLUMNS = [
        "claim_amount",
        "claims_last_7d",
        "claims_last_30d",
        "account_age",
        "historical_avg_claim_amount",
        "amount_deviation",
        "claims_ratio_7d_30d",
        "time_since_last_claim",
        "rolling_mean_7d",
        "rolling_std_7d",
        "z_score",
        "percentile_rank",
        "log_claim_amount",
        "log_historical_avg_claim_amount",
        "hour_of_day",
        "day_of_week",
        "ewma_claim_frequency",
        "spike_indicator",
        "device_change_flag",
        "location_change_flag",
        "velocity",
        "median_deviation",
        "mad_deviation",
    ]

    META_COLUMNS = [
        "catboost_score",
        "lightgbm_score",
        "anomaly_score_iforest",
        "anomaly_score_autoencoder",
        "graph_risk_score",
        "temporal_risk_score",
        "rule_flag",
    ]

    REASON_CODE_MAP = {
        "amount_deviation": "High claim amount deviation",
        "claims_ratio_7d_30d": "Recent claims are dense relative to 30-day history",
        "time_since_last_claim": "Very short gap since last claim",
        "z_score": "Unusually large claim compared to recent pattern",
        "claims_last_7d": "High short-term claim frequency",
        "velocity": "Rapid claim velocity relative to account age",
        "device_change_flag": "Device changed from user baseline",
        "location_change_flag": "Location pattern changed suddenly",
        "mad_deviation": "Claim is an outlier by robust median/MAD",
        "spike_indicator": "Sudden claim activity spike",
        "ewma_claim_frequency": "Elevated claim frequency trend",
    }

    def __init__(self, model_dir: str = "models", model_name: str = "hybrid_fraud_engine.joblib"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.model_path = self.model_dir / model_name

        # Rule layer state
        self.global_amount_threshold = 5000.0

        # Feature layer state
        self.quantile_transformer = QuantileTransformer(
            n_quantiles=500,
            output_distribution="uniform",
            subsample=100_000,
            random_state=42,
        )
        self.global_claim_median = 0.0
        self.global_claim_mad = 1.0
        self.user_device_baseline: dict[str, str] = {}
        self.user_location_baseline: dict[str, str] = {}
        self.user_last_claim_time: dict[str, datetime] = {}
        self.numeric_clip_bounds: dict[str, tuple[float, float]] = {}

        # Graph layer state
        self.identity_graph = nx.Graph()
        self.component_size_by_user: dict[str, int] = {}
        self.device_counts: dict[str, int] = {}
        self.ip_counts: dict[str, int] = {}

        # Core models
        self.catboost = CatBoostClassifier(
            iterations=250,
            depth=6,
            learning_rate=0.05,
            loss_function="Logloss",
            eval_metric="AUC",
            verbose=False,
            random_state=42,
        )
        self.lightgbm = LGBMClassifier(
            n_estimators=350,
            max_depth=-1,
            learning_rate=0.05,
            num_leaves=64,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=2.0,
            random_state=42,
            n_jobs=-1,
        )

        # Anomaly models
        self.scaler = StandardScaler()
        self.iforest = IsolationForest(
            n_estimators=250,
            contamination=0.08,
            random_state=42,
            n_jobs=-1,
        )
        self.autoencoder = MLPRegressor(
            hidden_layer_sizes=(64, 24, 64),
            activation="relu",
            alpha=1e-4,
            learning_rate_init=1e-3,
            max_iter=350,
            random_state=42,
        )

        # Stacking + calibration
        self.meta_model = LogisticRegression(max_iter=2000, n_jobs=-1)
        self.calibrator = IsotonicRegression(out_of_bounds="clip")

        self.selected_feature_columns = list(self.FEATURE_COLUMNS)
        self.active_meta_columns = list(self.META_COLUMNS)
        self.checkpoints: dict[str, float] = {}
        self.validation_report: dict[str, float] = {}
        self.sanity_report: dict[str, float] = {}
        self.early_anomaly_quantile = 0.97

        # Explainability
        self.cat_explainer: shap.TreeExplainer | None = None
        self.lgb_explainer: shap.TreeExplainer | None = None

        # Score normalization state
        self.iforest_min = 0.0
        self.iforest_max = 1.0
        self.auto_min = 0.0
        self.auto_max = 1.0

        self.metrics: dict[str, float] = {}
        self.model_version = "hybrid-fraud-engine-v2"
        self.trained_at_utc: str | None = None
        self.training_data_source = "unknown"
        self.training_db_records = 0
        self.is_trained = False

    # -------------------------------
    # Public API
    # -------------------------------

    def fit(
        self,
        records: list[dict[str, Any]],
        *,
        training_data_source: str | None = None,
        db_records: int | None = None,
    ) -> dict[str, float]:
        df = pd.DataFrame(records).copy()
        self._validate_training_data(df)
        df = self._run_data_quality_pipeline(df)
        self.training_data_source = (training_data_source or "api").strip() or "api"
        self.training_db_records = int(max(db_records or 0, 0))

        # True holdout split for trustworthy offline test metrics.
        y_all = df["label"].astype(int).to_numpy()
        dev_df, holdout_df = train_test_split(
            df,
            test_size=0.20,
            random_state=42,
            stratify=y_all,
        )

        # Development split used for feature/layer selection.
        y_dev_all = dev_df["label"].astype(int).to_numpy()
        train_df, valid_df = train_test_split(
            dev_df,
            test_size=0.25,
            random_state=42,
            stratify=y_dev_all,
        )

        # Layer 1 and 2 setup on train, transform valid.
        train_rule_flag, _ = self._apply_rules(train_df)
        train_features = self._build_features(train_df, fit=True)
        valid_rule_flag, _ = self._apply_rules(valid_df)
        valid_features = self._build_features(valid_df, fit=False)

        y_train = train_df["label"].astype(int).to_numpy()
        y_valid = valid_df["label"].astype(int).to_numpy()

        # Leakage sanity check before major training.
        self.sanity_report = self._run_label_shuffle_sanity_check(train_features, y_train, valid_features, y_valid)

        # Feature validation loop (CatBoost + SHAP) and dropping weak features.
        self.selected_feature_columns = self._select_features(train_features, y_train)

        # Build base supervised models with imbalance handling.
        pos_weight = self._compute_pos_weight(y_train)
        X_train = train_features[self.selected_feature_columns].to_numpy(dtype=float)
        X_valid = valid_features[self.selected_feature_columns].to_numpy(dtype=float)

        self.catboost = self._build_catboost(pos_weight)
        self.lightgbm = self._build_lightgbm(pos_weight)

        self.catboost.fit(X_train, y_train)
        self.lightgbm.fit(X_train, y_train)

        cat_valid = self.catboost.predict_proba(X_valid)[:, 1]
        lgb_valid = self.lightgbm.predict_proba(X_valid)[:, 1]

        # Early anomaly filter and anomaly features.
        self.scaler.fit(X_train)
        X_train_sc = self.scaler.transform(X_train)
        X_valid_sc = self.scaler.transform(X_valid)

        self.iforest = IsolationForest(
            n_estimators=250,
            contamination=0.08,
            random_state=42,
            n_jobs=-1,
        )
        self.iforest.fit(X_train_sc)

        iforest_train_raw = -self.iforest.decision_function(X_train_sc)
        iforest_valid_raw = -self.iforest.decision_function(X_valid_sc)
        self.iforest_min = float(np.min(iforest_train_raw))
        self.iforest_max = float(np.max(iforest_train_raw) + 1e-8)
        iforest_valid = np.array([
            self._normalize_with_state(float(v), self.iforest_min, self.iforest_max) for v in iforest_valid_raw
        ])

        anomaly_cutoff = float(np.quantile(iforest_train_raw, self.early_anomaly_quantile))
        normal_mask = iforest_train_raw <= anomaly_cutoff
        if np.sum(normal_mask) < max(100, int(0.5 * len(y_train))):
            normal_mask = np.ones_like(y_train, dtype=bool)

        self.autoencoder = MLPRegressor(
            hidden_layer_sizes=(64, 24, 64),
            activation="relu",
            alpha=1e-4,
            learning_rate_init=1e-3,
            max_iter=350,
            random_state=42,
        )
        self.autoencoder.fit(X_train_sc[normal_mask], X_train_sc[normal_mask])
        auto_train_rec = self.autoencoder.predict(X_train_sc)
        auto_valid_rec = self.autoencoder.predict(X_valid_sc)
        auto_train_raw = ((X_train_sc - auto_train_rec) ** 2).mean(axis=1)
        auto_valid_raw = ((X_valid_sc - auto_valid_rec) ** 2).mean(axis=1)
        self.auto_min = float(np.min(auto_train_raw))
        self.auto_max = float(np.max(auto_train_raw) + 1e-8)
        auto_valid = np.array([
            self._normalize_with_state(float(v), self.auto_min, self.auto_max) for v in auto_valid_raw
        ])

        # Layer features for checkpoint loop.
        graph_train = self._compute_graph_risk(train_df, fit=True)
        graph_valid = self._compute_graph_risk(valid_df, fit=False)
        temporal_train = self._compute_temporal_risk(train_features)
        temporal_valid = self._compute_temporal_risk(valid_features)

        base_train = pd.DataFrame(
            {
                "catboost_score": self.catboost.predict_proba(X_train)[:, 1],
                "lightgbm_score": self.lightgbm.predict_proba(X_train)[:, 1],
                "rule_flag": train_rule_flag,
            }
        )
        base_valid = pd.DataFrame(
            {
                "catboost_score": cat_valid,
                "lightgbm_score": lgb_valid,
                "rule_flag": valid_rule_flag,
            }
        )

        # Baseline checkpoint and layer-by-layer keep/discard.
        keep_cols = ["catboost_score", "lightgbm_score", "rule_flag"]
        best_metrics = self._train_meta_and_eval(base_train[keep_cols], y_train, base_valid[keep_cols], y_valid)
        self.checkpoints = {
            "baseline_f1": best_metrics["f1"],
            "baseline_precision": best_metrics["precision"],
            "baseline_recall": best_metrics["recall"],
            "baseline_roc_auc": best_metrics["roc_auc"],
            "baseline_pr_auc": best_metrics["pr_auc"],
        }

        layer_candidates = [
            (
                "anomaly",
                ["anomaly_score_iforest", "anomaly_score_autoencoder"],
                pd.DataFrame(
                    {
                        "anomaly_score_iforest": np.array([
                            self._normalize_with_state(float(v), self.iforest_min, self.iforest_max)
                            for v in iforest_train_raw
                        ]),
                        "anomaly_score_autoencoder": np.array([
                            self._normalize_with_state(float(v), self.auto_min, self.auto_max)
                            for v in auto_train_raw
                        ]),
                    }
                ),
                pd.DataFrame(
                    {
                        "anomaly_score_iforest": iforest_valid,
                        "anomaly_score_autoencoder": auto_valid,
                    }
                ),
            ),
            (
                "graph",
                ["graph_risk_score"],
                pd.DataFrame({"graph_risk_score": graph_train}),
                pd.DataFrame({"graph_risk_score": graph_valid}),
            ),
            (
                "temporal",
                ["temporal_risk_score"],
                pd.DataFrame({"temporal_risk_score": temporal_train}),
                pd.DataFrame({"temporal_risk_score": temporal_valid}),
            ),
        ]

        min_delta = 0.002
        current_train = base_train.copy()
        current_valid = base_valid.copy()
        for layer_name, cols, tr_extra, va_extra in layer_candidates:
            trial_train = pd.concat([current_train, tr_extra], axis=1)
            trial_valid = pd.concat([current_valid, va_extra], axis=1)
            trial_cols = keep_cols + cols
            trial_metrics = self._train_meta_and_eval(
                trial_train[trial_cols], y_train, trial_valid[trial_cols], y_valid
            )
            improved = trial_metrics["f1"] >= (best_metrics["f1"] + min_delta)
            self.checkpoints[f"{layer_name}_f1"] = trial_metrics["f1"]
            self.checkpoints[f"{layer_name}_delta_f1"] = trial_metrics["f1"] - best_metrics["f1"]
            self.checkpoints[f"{layer_name}_kept"] = 1.0 if improved else 0.0
            if improved:
                keep_cols = trial_cols
                current_train = trial_train
                current_valid = trial_valid
                best_metrics = trial_metrics

        self.active_meta_columns = keep_cols

        # Final training on development data; holdout remains untouched for test metrics.
        dev_rule_flag, _ = self._apply_rules(dev_df)
        dev_features = self._build_features(dev_df, fit=False)
        holdout_rule_flag, _ = self._apply_rules(holdout_df)
        holdout_features = self._build_features(holdout_df, fit=False)

        X_dev = dev_features[self.selected_feature_columns].to_numpy(dtype=float)
        y_dev = dev_df["label"].astype(int).to_numpy()
        X_holdout = holdout_features[self.selected_feature_columns].to_numpy(dtype=float)
        y_holdout = holdout_df["label"].astype(int).to_numpy()

        dev_pos_weight = self._compute_pos_weight(y_dev)
        self.catboost = self._build_catboost(dev_pos_weight)
        self.lightgbm = self._build_lightgbm(dev_pos_weight)
        self.catboost.fit(X_dev, y_dev)
        self.lightgbm.fit(X_dev, y_dev)

        cat_dev = self.catboost.predict_proba(X_dev)[:, 1]
        cat_holdout = self.catboost.predict_proba(X_holdout)[:, 1]
        lgb_dev = self.lightgbm.predict_proba(X_dev)[:, 1]
        lgb_holdout = self.lightgbm.predict_proba(X_holdout)[:, 1]

        self.scaler.fit(X_dev)
        X_dev_sc = self.scaler.transform(X_dev)
        X_holdout_sc = self.scaler.transform(X_holdout)

        self.iforest = IsolationForest(
            n_estimators=250,
            contamination=0.08,
            random_state=42,
            n_jobs=-1,
        )
        self.iforest.fit(X_dev_sc)

        iforest_dev_raw = -self.iforest.decision_function(X_dev_sc)
        iforest_holdout_raw = -self.iforest.decision_function(X_holdout_sc)
        self.iforest_min = float(np.min(iforest_dev_raw))
        self.iforest_max = float(np.max(iforest_dev_raw) + 1e-8)
        iforest_dev = np.array([
            self._normalize_with_state(float(v), self.iforest_min, self.iforest_max) for v in iforest_dev_raw
        ])
        iforest_holdout = np.array([
            self._normalize_with_state(float(v), self.iforest_min, self.iforest_max) for v in iforest_holdout_raw
        ])

        anomaly_cutoff = float(np.quantile(iforest_dev_raw, self.early_anomaly_quantile))
        normal_mask = iforest_dev_raw <= anomaly_cutoff
        if np.sum(normal_mask) < max(100, int(0.5 * len(y_dev))):
            normal_mask = np.ones_like(y_dev, dtype=bool)

        self.autoencoder = MLPRegressor(
            hidden_layer_sizes=(64, 24, 64),
            activation="relu",
            alpha=1e-4,
            learning_rate_init=1e-3,
            max_iter=350,
            random_state=42,
        )
        self.autoencoder.fit(X_dev_sc[normal_mask], X_dev_sc[normal_mask])
        auto_dev_rec = self.autoencoder.predict(X_dev_sc)
        auto_holdout_rec = self.autoencoder.predict(X_holdout_sc)
        auto_dev_raw = ((X_dev_sc - auto_dev_rec) ** 2).mean(axis=1)
        auto_holdout_raw = ((X_holdout_sc - auto_holdout_rec) ** 2).mean(axis=1)
        self.auto_min = float(np.min(auto_dev_raw))
        self.auto_max = float(np.max(auto_dev_raw) + 1e-8)
        auto_dev = np.array([
            self._normalize_with_state(float(v), self.auto_min, self.auto_max) for v in auto_dev_raw
        ])
        auto_holdout = np.array([
            self._normalize_with_state(float(v), self.auto_min, self.auto_max) for v in auto_holdout_raw
        ])

        graph_dev = self._compute_graph_risk(dev_df, fit=True)
        graph_holdout = self._compute_graph_risk(holdout_df, fit=False)
        temporal_dev = self._compute_temporal_risk(dev_features)
        temporal_holdout = self._compute_temporal_risk(holdout_features)

        meta_dev = pd.DataFrame(
            {
                "catboost_score": cat_dev,
                "lightgbm_score": lgb_dev,
                "anomaly_score_iforest": iforest_dev,
                "anomaly_score_autoencoder": auto_dev,
                "graph_risk_score": graph_dev,
                "temporal_risk_score": temporal_dev,
                "rule_flag": dev_rule_flag,
            }
        )
        meta_holdout = pd.DataFrame(
            {
                "catboost_score": cat_holdout,
                "lightgbm_score": lgb_holdout,
                "anomaly_score_iforest": iforest_holdout,
                "anomaly_score_autoencoder": auto_holdout,
                "graph_risk_score": graph_holdout,
                "temporal_risk_score": temporal_holdout,
                "rule_flag": holdout_rule_flag,
            }
        )

        self.meta_model.fit(meta_dev[self.active_meta_columns].to_numpy(dtype=float), y_dev)
        raw_dev = self.meta_model.predict_proba(meta_dev[self.active_meta_columns].to_numpy(dtype=float))[:, 1]
        self.calibrator.fit(raw_dev, y_dev)
        calibrated_dev = self.calibrator.predict(raw_dev)

        raw_holdout = self.meta_model.predict_proba(meta_holdout[self.active_meta_columns].to_numpy(dtype=float))[:, 1]
        calibrated_holdout = self.calibrator.predict(raw_holdout)

        # Layer 10: explainers
        self.cat_explainer = shap.TreeExplainer(self.catboost)
        self.lgb_explainer = shap.TreeExplainer(self.lightgbm)

        fit_eval = self._evaluate_scores(y_dev, calibrated_dev)
        holdout_eval = self._evaluate_scores(y_holdout, calibrated_holdout)
        self.trained_at_utc = datetime.now(timezone.utc).isoformat()

        self.metrics = {
            "precision": holdout_eval["precision"],
            "recall": holdout_eval["recall"],
            "f1": holdout_eval["f1"],
            "roc_auc_calibrated": holdout_eval["roc_auc"],
            "avg_precision_calibrated": holdout_eval["pr_auc"],
            "fit_precision": fit_eval["precision"],
            "fit_recall": fit_eval["recall"],
            "fit_f1": fit_eval["f1"],
            "fit_roc_auc": fit_eval["roc_auc"],
            "fit_pr_auc": fit_eval["pr_auc"],
            "holdout_precision": holdout_eval["precision"],
            "holdout_recall": holdout_eval["recall"],
            "holdout_f1": holdout_eval["f1"],
            "holdout_roc_auc": holdout_eval["roc_auc"],
            "holdout_pr_auc": holdout_eval["pr_auc"],
            "records": float(len(df)),
            "dev_records": float(len(dev_df)),
            "holdout_records": float(len(holdout_df)),
            "db_records": float(self.training_db_records),
            "selected_features": float(len(self.selected_feature_columns)),
            "active_meta_layers": float(len(self.active_meta_columns)),
            "leakage_warning": self.sanity_report.get("leakage_warning", 0.0),
        }
        self.metrics.update(self.checkpoints)
        self.metrics.update(self.validation_report)
        self.metrics.update(self.sanity_report)

        self.is_trained = True
        self.save()
        return self.metrics

    def predict_one(self, record: dict[str, Any]) -> FraudPredictionResult:
        if not self.is_trained:
            self.load()
        if not self.is_trained:
            raise RuntimeError("Fraud engine is not trained. Train first via /fraud/train.")

        df = pd.DataFrame([record]).copy()
        self._validate_prediction_data(df)
        df["claim_time"] = pd.to_datetime(df["claim_time"], utc=True)

        # Layer 1
        rule_flag, rule_reasons = self._apply_rules(df)

        # Layer 2
        features = self._build_features(df, fit=False)
        X = features[self.selected_feature_columns].to_numpy(dtype=float)

        # Layer 3
        cat_score = float(self.catboost.predict_proba(X)[:, 1][0])
        lgb_score = float(self.lightgbm.predict_proba(X)[:, 1][0])

        # Layer 4
        X_sc = self.scaler.transform(X)
        iforest_raw = float((-self.iforest.decision_function(X_sc))[0])
        iforest_score = self._normalize_with_state(iforest_raw, self.iforest_min, self.iforest_max)

        rec = self.autoencoder.predict(X_sc)
        auto_err = float(((X_sc - rec) ** 2).mean(axis=1)[0])
        auto_score = self._normalize_with_state(auto_err, self.auto_min, self.auto_max)

        # Layer 5 and 6
        graph_score = float(self._compute_graph_risk(df, fit=False)[0])
        temporal_score = float(self._compute_temporal_risk(features)[0])

        # Layer 7
        meta_values = {
            "catboost_score": cat_score,
            "lightgbm_score": lgb_score,
            "anomaly_score_iforest": iforest_score,
            "anomaly_score_autoencoder": auto_score,
            "graph_risk_score": graph_score,
            "temporal_risk_score": temporal_score,
            "rule_flag": float(rule_flag[0]),
        }
        meta_row = np.array([[meta_values[c] for c in self.active_meta_columns]], dtype=float)
        raw_score = float(self.meta_model.predict_proba(meta_row)[:, 1][0])

        # Layer 8
        calibrated_prob = float(self.calibrator.predict([raw_score])[0])
        risk_score = int(np.clip(round(calibrated_prob * 100), 0, 100))

        # Hard override: rule-confirmed high-risk behavior must not get auto-approved.
        override_score = self._rule_override_score(
            rule_reason=rule_reasons[0],
            feature_row=features.iloc[0],
        )
        if override_score > risk_score:
            risk_score = override_score
            calibrated_prob = max(calibrated_prob, risk_score / 100.0)

        # Layer 9
        account_age = float(df["account_age"].iloc[0])
        claims_last_30d = float(df["claims_last_30d"].iloc[0])
        decision = self._decision_from_thresholds(risk_score, account_age, claims_last_30d)
        if override_score >= 85:
            decision = "REJECT"
        elif override_score >= 70 and decision == "APPROVE":
            decision = "REVIEW"

        # Layer 10
        explain_reasons = self._explain_reasons(features[self.selected_feature_columns].iloc[[0]], rule_reasons[0])

        return FraudPredictionResult(
            risk_score=risk_score,
            decision=decision,
            reasons=explain_reasons,
            calibrated_probability=calibrated_prob,
            raw_score=raw_score,
            rule_flag=int(rule_flag[0]),
            rule_reason=rule_reasons[0],
            model_version=self.model_version,
            trained_at_utc=self.trained_at_utc,
            training_data_source=self.training_data_source,
            db_records=self.training_db_records,
        )

    def get_model_metadata(self) -> dict[str, Any]:
        if not self.is_trained:
            self.load()
        return {
            "model_version": self.model_version,
            "trained_at_utc": self.trained_at_utc,
            "training_data_source": self.training_data_source,
            "db_records": int(self.training_db_records),
            "is_trained": bool(self.is_trained),
        }

    def save(self) -> None:
        payload = {
            "model_version": self.model_version,
            "trained_at_utc": self.trained_at_utc,
            "training_data_source": self.training_data_source,
            "training_db_records": self.training_db_records,
            "global_amount_threshold": self.global_amount_threshold,
            "global_claim_median": self.global_claim_median,
            "global_claim_mad": self.global_claim_mad,
            "user_device_baseline": self.user_device_baseline,
            "user_location_baseline": self.user_location_baseline,
            "component_size_by_user": self.component_size_by_user,
            "device_counts": self.device_counts,
            "ip_counts": self.ip_counts,
            "quantile_transformer": self.quantile_transformer,
            "scaler": self.scaler,
            "catboost": self.catboost,
            "lightgbm": self.lightgbm,
            "iforest": self.iforest,
            "autoencoder": self.autoencoder,
            "meta_model": self.meta_model,
            "calibrator": self.calibrator,
            "iforest_min": self.iforest_min,
            "iforest_max": self.iforest_max,
            "auto_min": self.auto_min,
            "auto_max": self.auto_max,
            "selected_feature_columns": self.selected_feature_columns,
            "active_meta_columns": self.active_meta_columns,
            "checkpoints": self.checkpoints,
            "validation_report": self.validation_report,
            "sanity_report": self.sanity_report,
            "user_last_claim_time": self.user_last_claim_time,
            "numeric_clip_bounds": self.numeric_clip_bounds,
            "metrics": self.metrics,
            "is_trained": self.is_trained,
        }
        joblib.dump(payload, self.model_path)

    def load(self) -> None:
        if not self.model_path.exists():
            return
        payload = joblib.load(self.model_path)
        self.model_version = payload.get("model_version", self.model_version)
        self.trained_at_utc = payload.get("trained_at_utc")
        self.training_data_source = payload.get("training_data_source", "unknown")
        self.training_db_records = int(payload.get("training_db_records", 0))
        self.global_amount_threshold = payload["global_amount_threshold"]
        self.global_claim_median = payload["global_claim_median"]
        self.global_claim_mad = payload["global_claim_mad"]
        self.user_device_baseline = payload["user_device_baseline"]
        self.user_location_baseline = payload["user_location_baseline"]
        self.component_size_by_user = payload["component_size_by_user"]
        self.device_counts = payload["device_counts"]
        self.ip_counts = payload["ip_counts"]
        self.quantile_transformer = payload["quantile_transformer"]
        self.scaler = payload["scaler"]
        self.catboost = payload["catboost"]
        self.lightgbm = payload["lightgbm"]
        self.iforest = payload["iforest"]
        self.autoencoder = payload["autoencoder"]
        self.meta_model = payload["meta_model"]
        self.calibrator = payload["calibrator"]
        self.iforest_min = payload["iforest_min"]
        self.iforest_max = payload["iforest_max"]
        self.auto_min = payload["auto_min"]
        self.auto_max = payload["auto_max"]
        self.selected_feature_columns = payload.get("selected_feature_columns", list(self.FEATURE_COLUMNS))
        self.active_meta_columns = payload.get("active_meta_columns", list(self.META_COLUMNS))
        self.checkpoints = payload.get("checkpoints", {})
        self.validation_report = payload.get("validation_report", {})
        self.sanity_report = payload.get("sanity_report", {})
        self.user_last_claim_time = payload.get("user_last_claim_time", {})
        self.numeric_clip_bounds = payload.get("numeric_clip_bounds", {})
        self.metrics = payload.get("metrics", {})
        self.is_trained = payload.get("is_trained", False)

        if self.is_trained:
            self.cat_explainer = shap.TreeExplainer(self.catboost)
            self.lgb_explainer = shap.TreeExplainer(self.lightgbm)

    # -------------------------------
    # Validation
    # -------------------------------

    def _validate_training_data(self, df: pd.DataFrame) -> None:
        missing = self.REQUIRED_COLUMNS.union({"label"}) - set(df.columns)
        if missing:
            raise ValueError(f"Missing required training columns: {sorted(missing)}")
        if df.empty:
            raise ValueError("Training dataset is empty")
        if df["label"].nunique() < 2:
            raise ValueError("Training labels must contain both classes 0 and 1")
        if len(df) < 80:
            raise ValueError("Training dataset too small. Provide at least 80 records for stable fraud modeling")

    def _validate_prediction_data(self, df: pd.DataFrame) -> None:
        missing = self.REQUIRED_COLUMNS - set(df.columns)
        if missing:
            raise ValueError(f"Missing required prediction columns: {sorted(missing)}")

    # -------------------------------
    # Layer 1 - Rule engine
    # -------------------------------

    def _apply_rules(self, df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
        hist_avg = np.clip(df["historical_avg_claim_amount"].astype(float).to_numpy(), 1.0, None)
        claim_amt = df["claim_amount"].astype(float).to_numpy()
        claims_7d = df["claims_last_7d"].astype(float).to_numpy()
        account_age = df["account_age"].astype(float).to_numpy()

        dynamic_threshold = np.maximum(3.0 * hist_avg, self.global_amount_threshold)
        amount_flag = claim_amt > dynamic_threshold
        freq_flag = claims_7d > 4
        new_account_high_amount = (account_age < 14) & (claim_amt > np.maximum(2.0 * hist_avg, self.global_amount_threshold * 0.75))

        rule_flag = (amount_flag | freq_flag | new_account_high_amount).astype(int)
        reasons: list[str] = []
        for i in range(len(df)):
            r: list[str] = []
            if amount_flag[i]:
                r.append("RULE_HIGH_AMOUNT_DEVIATION")
            if freq_flag[i]:
                r.append("RULE_HIGH_7D_CLAIM_FREQUENCY")
            if new_account_high_amount[i]:
                r.append("RULE_NEW_ACCOUNT_HIGH_AMOUNT")
            reasons.append(",".join(r) if r else "RULE_NONE")
        return rule_flag, reasons

    # -------------------------------
    # Layer 2 - Feature engineering
    # -------------------------------

    def _build_features(self, df: pd.DataFrame, *, fit: bool) -> pd.DataFrame:
        out = df.copy()
        out["claim_amount"] = out["claim_amount"].astype(float)
        out["claims_last_7d"] = out["claims_last_7d"].astype(float)
        out["claims_last_30d"] = out["claims_last_30d"].astype(float)
        out["account_age"] = np.clip(out["account_age"].astype(float), 1.0, None)
        out["historical_avg_claim_amount"] = np.clip(out["historical_avg_claim_amount"].astype(float), 1.0, None)

        out["amount_deviation"] = out["claim_amount"] / out["historical_avg_claim_amount"]
        out["claims_ratio_7d_30d"] = out["claims_last_7d"] / np.clip(out["claims_last_30d"], 1.0, None)

        expected_weekly = np.clip(out["claims_last_30d"] / 4.2857, 0.0, None)
        out["rolling_mean_7d"] = out["historical_avg_claim_amount"] * (
            1.0 + out["claims_last_7d"] / np.clip(expected_weekly + 1.0, 1.0, None)
        )
        out["rolling_std_7d"] = np.abs(out["claim_amount"] - out["historical_avg_claim_amount"]) / (out["claims_last_7d"] + 1.0)
        out["z_score"] = (out["claim_amount"] - out["rolling_mean_7d"]) / np.clip(out["rolling_std_7d"], 1e-6, None)
        out["log_claim_amount"] = np.log1p(np.clip(out["claim_amount"], 0.0, None))
        out["log_historical_avg_claim_amount"] = np.log1p(np.clip(out["historical_avg_claim_amount"], 0.0, None))

        if fit:
            self.quantile_transformer.fit(out[["claim_amount"]])
            self.global_claim_median = float(np.median(out["claim_amount"]))
            self.global_claim_mad = float(np.median(np.abs(out["claim_amount"] - self.global_claim_median)))
            if self.global_claim_mad < 1e-6:
                self.global_claim_mad = 1.0
            self.global_amount_threshold = float(np.percentile(out["claim_amount"], 95))

            latest = out.sort_values("claim_time").groupby("user_id").tail(1)
            self.user_device_baseline = dict(zip(latest["user_id"].astype(str), latest["device_id"].astype(str)))
            self.user_location_baseline = dict(zip(latest["user_id"].astype(str), latest["location"].astype(str)))
            self.user_last_claim_time = dict(zip(latest["user_id"].astype(str), latest["claim_time"]))

        out["percentile_rank"] = self.quantile_transformer.transform(out[["claim_amount"]]).ravel()

        out["hour_of_day"] = pd.to_datetime(out["claim_time"], utc=True).dt.hour.astype(float)
        out["day_of_week"] = pd.to_datetime(out["claim_time"], utc=True).dt.dayofweek.astype(float)

        out["ewma_claim_frequency"] = 0.6 * out["claims_last_7d"] + 0.4 * expected_weekly
        out["spike_indicator"] = (out["claims_last_7d"] > (expected_weekly * 1.5 + 1.0)).astype(float)

        out["device_change_flag"] = out.apply(
            lambda r: float(str(r["device_id"]) != self.user_device_baseline.get(str(r["user_id"]), str(r["device_id"]))),
            axis=1,
        )
        out["location_change_flag"] = out.apply(
            lambda r: float(str(r["location"]) != self.user_location_baseline.get(str(r["user_id"]), str(r["location"]))),
            axis=1,
        )

        out["velocity"] = out["claims_last_7d"] / np.clip(out["account_age"], 1.0, None)
        out["median_deviation"] = np.abs(out["claim_amount"] - self.global_claim_median)
        out["mad_deviation"] = out["median_deviation"] / np.clip(self.global_claim_mad, 1e-6, None)

        if fit:
            self.numeric_clip_bounds = {}
            for col in [
                "claim_amount",
                "historical_avg_claim_amount",
                "claims_last_7d",
                "claims_last_30d",
                "account_age",
                "amount_deviation",
                "claims_ratio_7d_30d",
                "z_score",
                "velocity",
            ]:
                c_low = float(np.nanpercentile(out[col], 1))
                c_high = float(np.nanpercentile(out[col], 99))
                if c_high <= c_low:
                    c_high = c_low + 1.0
                self.numeric_clip_bounds[col] = (c_low, c_high)

        # Time gap feature from user history.
        if fit:
            out_sorted = out.sort_values(["user_id", "claim_time"]).copy()
            out_sorted["prev_claim_time"] = out_sorted.groupby("user_id")["claim_time"].shift(1)
            hours = (
                (out_sorted["claim_time"] - out_sorted["prev_claim_time"]).dt.total_seconds() / 3600.0
            ).fillna(24.0)
            out_sorted["time_since_last_claim"] = np.clip(hours, 0.0, 24.0 * 365.0)
            out = out_sorted.drop(columns=["prev_claim_time"])
        else:
            out["time_since_last_claim"] = out.apply(
                lambda r: self._inference_time_since_last_claim(str(r["user_id"]), pd.to_datetime(r["claim_time"], utc=True)),
                axis=1,
            )

        # Robust clipping learned from train.
        if self.numeric_clip_bounds:
            for col, (low, high) in self.numeric_clip_bounds.items():
                if col in out.columns:
                    out[col] = np.clip(out[col], low, high)

        # Ensure numeric and finite
        out[self.FEATURE_COLUMNS] = out[self.FEATURE_COLUMNS].replace([np.inf, -np.inf], np.nan).fillna(0.0)
        return out

    # -------------------------------
    # Layer 5 - Graph intelligence
    # -------------------------------

    def _compute_graph_risk(self, df: pd.DataFrame, *, fit: bool) -> np.ndarray:
        users = df["user_id"].astype(str)
        devices = df["device_id"].astype(str)
        ips = df["ip_address"].astype(str)

        if fit:
            self.identity_graph = nx.Graph()
            for u, d, ip in zip(users, devices, ips):
                u_node = f"u:{u}"
                d_node = f"d:{d}"
                ip_node = f"ip:{ip}"
                self.identity_graph.add_edge(u_node, d_node)
                self.identity_graph.add_edge(u_node, ip_node)

            self.device_counts = devices.value_counts().to_dict()
            self.ip_counts = ips.value_counts().to_dict()

            self.component_size_by_user = {}
            for comp in nx.connected_components(self.identity_graph):
                comp_size = len(comp)
                for node in comp:
                    if node.startswith("u:"):
                        self.component_size_by_user[node[2:]] = comp_size

        scores = np.zeros(len(df), dtype=float)
        for i, (u, d, ip) in enumerate(zip(users, devices, ips)):
            comp_size = float(self.component_size_by_user.get(u, 1))
            shared_device = max(int(self.device_counts.get(d, 1)) - 1, 0)
            shared_ip = max(int(self.ip_counts.get(ip, 1)) - 1, 0)
            score = comp_size * 3.0 + shared_device * 15.0 + shared_ip * 10.0
            scores[i] = np.clip(score, 0.0, 100.0)
        return scores

    # -------------------------------
    # Layer 6 - Temporal intelligence
    # -------------------------------

    def _compute_temporal_risk(self, features: pd.DataFrame) -> np.ndarray:
        claims_7d = features["claims_last_7d"].to_numpy(dtype=float)
        claims_30d = features["claims_last_30d"].to_numpy(dtype=float)
        ewma = features["ewma_claim_frequency"].to_numpy(dtype=float)

        expected_weekly = claims_30d / 4.2857
        freq_change = claims_7d - expected_weekly
        burst = (freq_change > 2.0).astype(float)

        ewma_norm = np.clip(ewma / 10.0, 0.0, 1.0)
        delta_norm = np.clip(freq_change / 10.0, 0.0, 1.0)

        score = (0.45 * ewma_norm + 0.35 * delta_norm + 0.20 * burst) * 100.0
        return np.clip(score, 0.0, 100.0)

    # -------------------------------
    # Layer 9 - Decision engine
    # -------------------------------

    def _decision_from_thresholds(self, risk_score: int, account_age: float, claims_last_30d: float) -> Decision:
        # Fixed policy requested by product:
        #  > 80  -> REJECT
        #  > 20  -> REVIEW
        # <= 20  -> APPROVE
        if risk_score > 80:
            return "REJECT"
        if risk_score > 20:
            return "REVIEW"
        return "APPROVE"

    def _rule_override_score(self, rule_reason: str, feature_row: pd.Series) -> int:
        if not rule_reason or rule_reason == "RULE_NONE":
            return 0

        tokens = set(rule_reason.split(","))
        score = 0
        if "RULE_HIGH_AMOUNT_DEVIATION" in tokens:
            score += 35
        if "RULE_HIGH_7D_CLAIM_FREQUENCY" in tokens:
            score += 30
        if "RULE_NEW_ACCOUNT_HIGH_AMOUNT" in tokens:
            score += 35

        amount_dev = float(feature_row.get("amount_deviation", 0.0))
        claims_ratio = float(feature_row.get("claims_ratio_7d_30d", 0.0))
        time_gap = float(feature_row.get("time_since_last_claim", 24.0))
        account_age = float(feature_row.get("account_age", 365.0))

        if amount_dev >= 4.0:
            score += 15
        if claims_ratio >= 0.60:
            score += 10
        if time_gap <= 12.0:
            score += 10
        if account_age <= 14.0:
            score += 10

        return int(np.clip(score, 0, 99))

    # -------------------------------
    # Layer 10 - Explainability
    # -------------------------------

    def _explain_reasons(self, feature_row: pd.DataFrame, rule_reason: str) -> list[str]:
        reasons: list[str] = []

        if self.cat_explainer is not None and self.lgb_explainer is not None:
            row_vals = feature_row.to_numpy(dtype=float)
            cat_sv = self._flatten_shap_values(self.cat_explainer.shap_values(row_vals))
            lgb_sv = self._flatten_shap_values(self.lgb_explainer.shap_values(row_vals))

            combined = np.abs(cat_sv) + np.abs(lgb_sv)
            top_idx = np.argsort(combined)[::-1][:5]
            for idx in top_idx:
                if int(idx) >= len(self.selected_feature_columns):
                    continue
                fname = self.selected_feature_columns[int(idx)]
                reason = self.REASON_CODE_MAP.get(fname)
                if reason and reason not in reasons:
                    reasons.append(reason)

        if rule_reason and rule_reason != "RULE_NONE":
            mapping = {
                "RULE_HIGH_AMOUNT_DEVIATION": "High claim amount deviation",
                "RULE_HIGH_7D_CLAIM_FREQUENCY": "Multiple claims in short period",
                "RULE_NEW_ACCOUNT_HIGH_AMOUNT": "High amount from newly created account",
            }
            for token in rule_reason.split(","):
                readable = mapping.get(token)
                if readable and readable not in reasons:
                    reasons.append(readable)

        if not reasons:
            reasons = ["No dominant fraud indicators detected"]

        return reasons[:5]

    @staticmethod
    def _flatten_shap_values(values: Any) -> np.ndarray:
        if isinstance(values, list):
            if len(values) == 2:
                arr = np.asarray(values[1])
            else:
                arr = np.asarray(values[0])
        else:
            arr = np.asarray(values)
        if arr.ndim == 2:
            return arr[0]
        if arr.ndim == 1:
            return arr
        return arr.reshape(-1)

    @staticmethod
    def _minmax(values: np.ndarray) -> np.ndarray:
        vmin = float(np.min(values))
        vmax = float(np.max(values))
        if vmax - vmin < 1e-8:
            return np.zeros_like(values, dtype=float)
        return (values - vmin) / (vmax - vmin)

    @staticmethod
    def _normalize_with_state(value: float, vmin: float, vmax: float) -> float:
        denom = max(vmax - vmin, 1e-8)
        return float(np.clip((value - vmin) / denom, 0.0, 1.0))

    def _compute_pos_weight(self, y: np.ndarray) -> float:
        pos = float(np.sum(y == 1))
        neg = float(np.sum(y == 0))
        if pos <= 0.0:
            return 1.0
        return max(1.0, neg / pos)

    def _build_catboost(self, pos_weight: float) -> CatBoostClassifier:
        return CatBoostClassifier(
            iterations=260,
            depth=6,
            learning_rate=0.05,
            loss_function="Logloss",
            eval_metric="AUC",
            class_weights=[1.0, pos_weight],
            verbose=False,
            random_state=42,
        )

    def _build_lightgbm(self, pos_weight: float) -> LGBMClassifier:
        return LGBMClassifier(
            n_estimators=360,
            max_depth=-1,
            learning_rate=0.05,
            num_leaves=64,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=2.0,
            scale_pos_weight=pos_weight,
            random_state=42,
            n_jobs=-1,
        )

    def _evaluate_scores(self, y_true: np.ndarray, scores: np.ndarray, threshold: float = 0.5) -> dict[str, float]:
        y_pred = (scores >= threshold).astype(int)
        try:
            roc = float(roc_auc_score(y_true, scores))
        except Exception:
            roc = 0.5
        try:
            pr = float(average_precision_score(y_true, scores))
        except Exception:
            pr = float(np.mean(y_true))
        return {
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            "roc_auc": roc,
            "pr_auc": pr,
        }

    def _train_meta_and_eval(
        self,
        X_train_meta: pd.DataFrame,
        y_train: np.ndarray,
        X_valid_meta: pd.DataFrame,
        y_valid: np.ndarray,
    ) -> dict[str, float]:
        model = LogisticRegression(max_iter=2000, n_jobs=-1)
        model.fit(X_train_meta.to_numpy(dtype=float), y_train)
        train_raw = model.predict_proba(X_train_meta.to_numpy(dtype=float))[:, 1]
        calibrator = IsotonicRegression(out_of_bounds="clip")
        calibrator.fit(train_raw, y_train)
        valid_raw = model.predict_proba(X_valid_meta.to_numpy(dtype=float))[:, 1]
        valid_cal = calibrator.predict(valid_raw)
        return self._evaluate_scores(y_valid, valid_cal)

    def _select_features(self, features: pd.DataFrame, y: np.ndarray) -> list[str]:
        X = features[self.FEATURE_COLUMNS].to_numpy(dtype=float)
        pos_weight = self._compute_pos_weight(y)
        selector_model = self._build_catboost(pos_weight)
        selector_model.fit(X, y)

        fi = np.asarray(selector_model.get_feature_importance(), dtype=float)
        fi_norm = fi / (np.sum(fi) + 1e-8)

        sample_n = min(250, len(features))
        sample_idx = np.arange(sample_n)
        shap_vals = shap.TreeExplainer(selector_model).shap_values(X[sample_idx])
        shap_arr = self._flatten_shap_values(shap_vals)
        if shap_arr.ndim == 2:
            shap_imp = np.mean(np.abs(shap_arr), axis=0)
        else:
            shap_imp = np.abs(shap_arr)
        shap_imp = np.asarray(shap_imp, dtype=float)
        if shap_imp.shape[0] != len(self.FEATURE_COLUMNS):
            shap_imp = np.resize(shap_imp, len(self.FEATURE_COLUMNS))
        shap_norm = shap_imp / (np.sum(shap_imp) + 1e-8)

        combined = 0.55 * fi_norm + 0.45 * shap_norm
        ranking = sorted(
            [(self.FEATURE_COLUMNS[i], float(combined[i])) for i in range(len(self.FEATURE_COLUMNS))],
            key=lambda x: x[1],
            reverse=True,
        )

        min_features = 10
        keep = [name for name, score in ranking if score > 0.01]
        if len(keep) < min_features:
            keep = [name for name, _ in ranking[:min_features]]

        # Keep mandatory behavior features.
        for must_have in ["amount_deviation", "claims_ratio_7d_30d", "time_since_last_claim"]:
            if must_have not in keep and must_have in self.FEATURE_COLUMNS:
                keep.append(must_have)
        return [f for f in self.FEATURE_COLUMNS if f in set(keep)]

    def _run_data_quality_pipeline(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        out["claim_time"] = pd.to_datetime(out["claim_time"], utc=True, errors="coerce")

        missing_cells = float(out.isna().sum().sum())
        duplicate_rows = float(out.duplicated().sum())

        now = datetime.now(timezone.utc)
        invalid_time_mask = out["claim_time"].isna() | (out["claim_time"] > now)
        invalid_timestamps = float(np.sum(invalid_time_mask))

        out = out[~out.duplicated()].copy()
        out = out[~invalid_time_mask].copy()

        # Fill missing numerics with robust medians.
        numeric_cols = [
            "claim_amount",
            "claims_last_7d",
            "claims_last_30d",
            "account_age",
            "historical_avg_claim_amount",
        ]
        for col in numeric_cols:
            out[col] = pd.to_numeric(out[col], errors="coerce")
            med = float(np.nanmedian(out[col])) if np.isfinite(np.nanmedian(out[col])) else 0.0
            out[col] = out[col].fillna(med)

        # Simple category checks.
        invalid_location = float(np.sum(out["location"].astype(str).str.len() > 120))
        out["location"] = out["location"].astype(str).str.slice(0, 120)

        # Clip extreme numeric outliers (robust bounds).
        outlier_flags = 0
        for col in numeric_cols:
            low = float(np.nanpercentile(out[col], 1))
            high = float(np.nanpercentile(out[col], 99))
            if high <= low:
                continue
            outlier_flags += int(np.sum((out[col] < low) | (out[col] > high)))
            out[col] = np.clip(out[col], low, high)

        self.validation_report = {
            "dq_missing_cells": missing_cells,
            "dq_duplicate_rows": duplicate_rows,
            "dq_invalid_timestamps": invalid_timestamps,
            "dq_invalid_location": invalid_location,
            "dq_outlier_flags": float(outlier_flags),
        }

        if out.empty:
            raise ValueError("No valid records remain after data quality validation")
        return out

    def _run_label_shuffle_sanity_check(
        self,
        train_features: pd.DataFrame,
        y_train: np.ndarray,
        valid_features: pd.DataFrame,
        y_valid: np.ndarray,
    ) -> dict[str, float]:
        X_tr = train_features[self.FEATURE_COLUMNS].to_numpy(dtype=float)
        X_va = valid_features[self.FEATURE_COLUMNS].to_numpy(dtype=float)
        y_shuffle = y_train.copy()
        np.random.default_rng(42).shuffle(y_shuffle)

        model = self._build_catboost(self._compute_pos_weight(y_shuffle))
        model.fit(X_tr, y_shuffle)
        score = model.predict_proba(X_va)[:, 1]
        auc = float(roc_auc_score(y_valid, score))
        leakage_warning = 1.0 if auc > 0.70 else 0.0
        return {
            "sanity_shuffle_auc": auc,
            "leakage_warning": leakage_warning,
        }

    def _inference_time_since_last_claim(self, user_id: str, claim_time: pd.Timestamp) -> float:
        prev = self.user_last_claim_time.get(user_id)
        if prev is None:
            return 24.0
        prev_ts = pd.to_datetime(prev, utc=True)
        hours = float((claim_time - prev_ts).total_seconds() / 3600.0)
        return float(np.clip(hours, 0.0, 24.0 * 365.0))


fraud_engine = HybridFraudEngine(model_dir=str(Path(__file__).resolve().parents[2] / "models"))
