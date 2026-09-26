import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors } from '@/src/theme/tokens';

export default function FriendsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>
      <View style={styles.center}><Text style={styles.emoji}>☺︎ ☺︎</Text><Text style={styles.title}>Friends are next.</Text><Text style={styles.copy}>Online identity, invites and room presence will plug into this screen.</Text></View>
      <CrocatButton onPress={() => router.push('/play')}>PLAY LOCALLY</CrocatButton>
    </Screen>
  );
}
const styles = StyleSheet.create({ back:{color:colors.muted,fontWeight:'800'},center:{flex:1,alignItems:'center',justifyContent:'center'},emoji:{fontSize:70,color:colors.ink},title:{fontSize:40,fontWeight:'900',color:colors.ink},copy:{marginTop:10,textAlign:'center',color:colors.muted,fontSize:17,maxWidth:420,lineHeight:24} });
