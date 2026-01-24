interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ children, fallback }: FeatureGateProps) {
  // Check if feature is enabled for user's institution
  // For now, always show (feature flags not yet implemented)
  // TODO: When feature flags are implemented, use the feature prop to check
  // institutionFeatures[`${feature}_enabled`] from user context
  const isEnabled = true;

  if (!isEnabled) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
