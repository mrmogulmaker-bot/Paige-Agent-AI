import {useSoloCampaigns} from './adapter';
export function useTenantContext(){const {tenantId}=useSoloCampaigns();return{activeTenantId:tenantId,activeUserId:'fixture-owner',activeTenant:{id:tenantId,name:'Local context '+tenantId,account_number:'local',account_type:'solo',owner_user_id:'fixture-owner'},isLoading:false,loading:false,tenants:[],tenantRole:'owner'};}
