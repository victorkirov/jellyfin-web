import { useQuery } from '@tanstack/react-query';
import { useApi } from 'hooks/useApi';
import { getUserQuery, type GetUserByIdParams } from 'lib/queries/user';

export { getUserQuery, QUERY_KEY } from 'lib/queries/user';

export const useUser = ({ userId }: GetUserByIdParams) => {
    const { api, user } = useApi();

    return useQuery(getUserQuery(api, { userId: userId || user?.Id }));
};
