import { useQuery } from '@tanstack/react-query';
import { useApi } from 'hooks/useApi';
import { getBrandingOptionsQuery } from 'lib/queries/brandingOptions';

export { getBrandingOptionsQuery, QUERY_KEY } from 'lib/queries/brandingOptions';

export const useBrandingOptions = () => {
    const { api } = useApi();
    return useQuery(getBrandingOptionsQuery(api));
};
